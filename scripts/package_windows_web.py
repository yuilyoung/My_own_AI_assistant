"""Package the public Vite build for Windows, or verify its checked-in ZIP."""

import argparse
import stat
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "apps" / "web" / "dist"
ARCHIVE = ROOT / "windows" / "web-dist.zip"


def dist_members() -> dict[str, Path]:
    if DIST.is_symlink() or not DIST.is_dir():
        raise ValueError("Expected a regular apps/web/dist directory. Build apps/web first.")
    members = {}
    for path in sorted(DIST.rglob("*")):
        relative = path.relative_to(DIST)
        parts = {part.casefold() for part in relative.parts}
        name = path.name.casefold()
        if path.is_symlink():
            raise ValueError(f"Build symlink is forbidden: {relative}")
        if (
            parts & {"avatar-local", "avatar-runtime"}
            or name.endswith((".moc3", ".model3.json", ".cmo3", ".motion3.json", ".exp3.json"))
            or name.startswith(("live2dcubismcore", "live2dcubismframework"))
        ):
            raise ValueError(f"Private Live2D asset is forbidden: {relative}")
        if any("\\" in part or ":" in part for part in relative.parts):
            raise ValueError(f"Invalid Windows asset path: {relative}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"Only regular files can be packaged: {relative}")
        members[relative.as_posix()] = path

    if "index.html" not in members or not any(name.startswith("assets/") for name in members):
        raise ValueError("Expected index.html and assets in apps/web/dist. Rebuild apps/web.")
    return dict(sorted(members.items()))


def verify(members: dict[str, Path]) -> None:
    if not ARCHIVE.is_file():
        raise ValueError("Missing windows/web-dist.zip. Run scripts/package_windows_web.py.")
    with ZipFile(ARCHIVE) as package:
        entries = package.infolist()
        if [entry.filename for entry in entries] != list(members):
            raise ValueError(
                "ZIP member list differs from the build. Regenerate windows/web-dist.zip."
            )
        for entry in entries:
            name = entry.filename
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"ZIP symlink is forbidden: {name}")
            content = members[name].read_bytes()
            if entry.file_size != len(content) or package.read(entry) != content:
                raise ValueError(f"Stale ZIP member: {name}. Regenerate windows/web-dist.zip.")


def write(members: dict[str, Path]) -> None:
    ARCHIVE.parent.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=ARCHIVE.parent) as staging:
        output = Path(staging) / ARCHIVE.name
        with ZipFile(output, "w") as package:
            for name, source in members.items():
                entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | 0o644) << 16
                package.writestr(
                    entry, source.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9
                )
        output.replace(ARCHIVE)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Verify the ZIP against the current build"
    )
    args = parser.parse_args()
    try:
        if ARCHIVE.is_symlink() or ARCHIVE.parent.is_symlink():
            raise ValueError("The Windows package path cannot be a symlink.")
        members = dist_members()
        if args.check:
            verify(members)
        else:
            write(members)
    except (OSError, ValueError, RuntimeError, BadZipFile) as error:
        parser.exit(1, f"Windows web package: {error}\n")
    action = "Verified" if args.check else "Wrote"
    print(f"{action} windows/web-dist.zip ({len(members)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
