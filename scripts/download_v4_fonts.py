from pathlib import Path
from urllib.request import urlopen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1] / 'assets' / 'fonts'
root.mkdir(parents=True, exist_ok=True)
sources = {
    'BricolageGrotesque': 'https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf',
    'Figtree': 'https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/Figtree%5Bwght%5D.ttf',
}
for family, url in sources.items():
    source = root / f'{family}-Variable.ttf'
    if not source.exists():
        source.write_bytes(urlopen(url).read())
    for weight in ([700, 800] if family == 'BricolageGrotesque' else [400, 500, 600, 700]):
        output = root / f'{family}-{weight}.ttf'
        if not output.exists():
            font = TTFont(source)
            instantiateVariableFont(font, {'wght': weight}, inplace=True)
            font.save(output)
    license_url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{family.lower()}/OFL.txt'
    license_file = root / f'{family}-OFL.txt'
    if not license_file.exists():
        license_file.write_bytes(urlopen(license_url).read())
