"""Extract verified model archives while rejecting links and path traversal."""
import pathlib
import shutil
import sys
import tarfile

root = pathlib.Path(sys.argv[2]).resolve()
with tarfile.open(sys.argv[1], 'r:*') as archive:
    for member in archive:
        target = (root / member.name).resolve()
        if root not in target.parents or member.issym() or member.islnk():
            raise ValueError('Invalid archive path')
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        elif member.isfile():
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open('wb') as output:
                shutil.copyfileobj(source, output)
