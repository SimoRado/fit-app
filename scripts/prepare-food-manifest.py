"""Add a public HTTPS base URL to a validated, immutable local catalog manifest.

This does not upload or publish files. Example:
python scripts/prepare-food-manifest.py --manifest build/catalog/manifest-v4.json \
  --base-url https://assets.example.com --output build/catalog/manifest-public-v4.json
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True, type=Path)
    p.add_argument('--base-url', required=True)
    p.add_argument('--output', required=True, type=Path)
    args = p.parse_args()
    parsed = urlparse(args.base_url)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.query or parsed.fragment:
        p.error('base URL must be an HTTPS origin or path without query or fragment')
    release = json.loads(args.manifest.read_text(encoding='utf-8'))
    for label in ('full',):
        file = release['catalogs'][label]['filename']
        release['catalogs'][label]['download_url'] = f"{args.base_url.rstrip('/')}/nutrition/{label}/{file}"
    if args.output.exists():
        p.error('refusing to overwrite an existing public manifest')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
