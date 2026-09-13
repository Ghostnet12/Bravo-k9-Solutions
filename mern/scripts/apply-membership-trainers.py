"""One-time, hash-checked source transfer. Contains no credentials or customer data."""
from pathlib import Path
import base64, gzip, hashlib, json, os
if os.environ.get('GITHUB_REF_NAME') != 'bravo-membership-dates-shared-trainers':
    raise SystemExit('This transfer is restricted to the review branch.')
root = Path(__file__).resolve().parents[2]
parts = [root / f'mern/scripts/membership-payload-{i}.b64' for i in [1,2]]
raw = gzip.decompress(base64.b64decode(''.join(p.read_text().strip() for p in parts), validate=True))
if hashlib.sha256(raw).hexdigest() != '1f4a20f53e1a974c46333ce20350d10792701457da4764d1b7d2604a6fb31f82':
    raise SystemExit('Transfer digest mismatch; nothing changed.')
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
prepared = []
for item in json.loads(raw):
    relative = Path(item['path'])
    if relative.is_absolute() or '..' in relative.parts or not item['path'].startswith(('mern/server/','mern/shared/','mern/client/src/','mern/tests/')):
        raise SystemExit('Unexpected source path.')
    path = root / relative
    if path.resolve() != path or path.is_symlink():
        raise SystemExit('Unexpected source symlink.')
    before = path.read_bytes() if path.exists() else None
    if (blob(before) if before is not None else None) != item['before']:
        raise SystemExit(f'Source changed: {relative}. Reconcile instead of overwriting.')
    text = before.decode() if before is not None else ''
    for start, end, inserted in reversed(item['ops']):
        text = text[:start] + inserted + text[end:]
    data = text.encode()
    if blob(data) != item['after']:
        raise SystemExit(f'Result mismatch: {relative}. Nothing changed.')
    prepared.append((path,data))
for path,data in prepared:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)
for path in parts:
    path.unlink()
Path(__file__).unlink()
print(f'Applied {len(prepared)} verified source changes; transfer files removed.')
