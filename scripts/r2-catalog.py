"""Inspect and upload a versioned Cubyfit catalog through R2's S3 API.

Credentials stay in the existing private file. Never pass keys on the command
line or put them in Expo variables. Requires boto3 in a local Python runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import zlib
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointConnectionError

BUCKET = 'cubyfit-assets'
OBJECT = 'nutrition/full/foods-full-v4.sqlite.gz'


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def credentials(path: Path):
    raw = path.read_text(encoding='utf-8-sig')
    access = re.search(r'^Access Key ID\s*:\s*([A-Za-z0-9]+)\s*$', raw, re.M | re.I)
    secret = re.search(r'^Secret Access Key\s*:\s*([A-Za-z0-9]+)\s*$', raw, re.M | re.I)
    endpoint = re.search(r'https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com\b', raw)
    if not (access and secret and endpoint):
        raise ValueError('Private credentials file needs Access Key ID, Secret Access Key, and S3 endpoint')
    return access.group(1), secret.group(1), endpoint.group(0)


def client(path: Path):
    access, secret, endpoint = credentials(path)
    return boto3.client('s3', endpoint_url=endpoint, aws_access_key_id=access,
        aws_secret_access_key=secret, region_name='auto',
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'},
            request_checksum_calculation='when_required', response_checksum_validation='when_required'))


def head(s3, key):
    try:
        return s3.head_object(Bucket=BUCKET, Key=key)
    except ClientError as error:
        code = error.response.get('Error', {}).get('Code')
        if code in ('404', 'NoSuchKey', 'NotFound'):
            return None
        raise


def inspect(s3):
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix='nutrition/', MaxKeys=100)
    print('r2_connection=verified')
    print('bucket=' + BUCKET)
    for item in response.get('Contents', []):
        print(f"object={item['Key']} bytes={item['Size']}")
    if not response.get('Contents'):
        print('nutrition_objects=0')


def verify_remote(s3, key, expected, size, sqlite_sha=None, sqlite_path=None):
    meta = head(s3, key)
    if not meta:
        raise ValueError(f'Object is absent: {key}')
    if meta['ContentLength'] != size:
        raise ValueError(f'Object has wrong size: {key}')
    required_type = ('application/gzip' if key.endswith('.gz') else
        'application/json' if key.endswith('.json') else
        'text/markdown; charset=utf-8' if key.endswith('.md') else
        'text/plain; charset=utf-8')
    if meta.get('ContentType') != required_type:
        raise ValueError(f'Object has wrong content type: {key}')
    if meta.get('ContentEncoding'):
        raise ValueError(f'Unexpected Content-Encoding on: {key}')
    body = s3.get_object(Bucket=BUCKET, Key=key)['Body']
    compressed = hashlib.sha256()
    unpacked = hashlib.sha256() if sqlite_sha else None
    unzip = zlib.decompressobj(31) if sqlite_sha else None
    try:
        for chunk in iter(lambda: body.read(1024 * 1024), b''):
            compressed.update(chunk)
            if unzip:
                unpacked.update(unzip.decompress(chunk))
        if unzip:
            unpacked.update(unzip.flush())
    finally:
        body.close()
    if compressed.hexdigest() != expected:
        raise ValueError(f'Authenticated download checksum failed: {key}')
    if sqlite_sha and unpacked.hexdigest() != sqlite_sha:
        raise ValueError(f'Decompressed SQLite checksum failed: {key}')
    if sqlite_path:
        db = sqlite3.connect(f'file:{sqlite_path}?mode=ro', uri=True)
        try:
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('SQLite integrity check failed')
        finally:
            db.close()
    print(f'verified={key} bytes={size} sha256={expected}')


def upload(s3, key, path, expected, content_type):
    if digest(path) != expected:
        raise ValueError(f'Local checksum mismatch: {path.name}')
    prior = head(s3, key)
    if prior:
        print(f'existing_object={key}; checking without overwriting')
        verify_remote(s3, key, expected, path.stat().st_size)
        return
    with path.open('rb') as source:
        s3.put_object(Bucket=BUCKET, Key=key, Body=source,
            ContentLength=path.stat().st_size, ContentType=content_type,
            CacheControl='public, max-age=31536000, immutable',
            Metadata={'sha256': expected}, IfNoneMatch='*')
    print(f'uploaded={key} bytes={path.stat().st_size}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=('inspect', 'upload-full', 'verify-full', 'publish-manifest'))
    p.add_argument('--credentials-file', type=Path, required=True)
    p.add_argument('--manifest', type=Path, default=Path('build/catalog/manifest-v4.json'))
    args = p.parse_args()
    try:
        s3 = client(args.credentials_file)
        if args.action == 'inspect':
            inspect(s3)
            return
        if args.action == 'publish-manifest':
            release = json.loads(args.manifest.read_text(encoding='utf-8'))
            version = release['version']
            if not re.fullmatch(r'v[1-9][0-9]*', version):
                raise ValueError('Invalid manifest version')
            full = release['catalogs']['full']
            if not re.fullmatch(r'https://[^\s]+/nutrition/full/foods-full-' + version + r'\.sqlite\.gz', full['download_url'] or ''):
                raise ValueError('Manifest full URL is missing or invalid')
            key = f'nutrition/manifest-{version}.json'
            expected = digest(args.manifest)
            upload(s3, key, args.manifest, expected, 'application/json')
            verify_remote(s3, key, expected, args.manifest.stat().st_size)
            return
        release = json.loads(args.manifest.read_text(encoding='utf-8'))
        full = release['catalogs']['full']
        path = args.manifest.parent / full['filename']
        if args.action == 'upload-full':
            for name in ('LICENSE-ODbL.txt', 'LICENSE-DbCL.txt', 'OPENNUTRITION_NOTICE.md'):
                local = Path('src/data/catalog') / name
                key = 'nutrition/' + name
                upload(s3, key, local, digest(local),
                    'text/markdown; charset=utf-8' if name.endswith('.md') else 'text/plain; charset=utf-8')
                verify_remote(s3, key, digest(local), local.stat().st_size)
            upload(s3, OBJECT, path, full['sha256'], 'application/gzip')
        verify_remote(s3, OBJECT, full['sha256'], full['compressed_bytes'],
            full['sqlite_sha256'], args.manifest.parent / full['filename'].removesuffix('.gz'))
    except (ClientError, EndpointConnectionError) as error:
        if isinstance(error, ClientError):
            print('R2 error code=' + str(error.response.get('Error', {}).get('Code', 'unknown')), file=sys.stderr)
        else:
            print('R2 endpoint connection failed', file=sys.stderr)
        raise SystemExit(1)
    except (OSError, ValueError, KeyError, zlib.error) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
