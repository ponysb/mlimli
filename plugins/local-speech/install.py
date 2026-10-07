"""Extract only regular model files; reject archive traversal and links."""
import pathlib
import sys
import tarfile

root = pathlib.Path(sys.argv[1]).resolve()
name = sys.argv[2]
with tarfile.open(root / (name + '.tar.bz2')) as archive:
    for member in archive.getmembers():
        target = (root / member.name).resolve()
        if root not in target.parents or member.issym() or member.islnk():
            raise ValueError('Invalid model archive path')
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        elif member.isfile():
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open('wb') as output:
                import shutil
                shutil.copyfileobj(source, output)
