import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def pytest_collection_modifyitems(config, items):
    for item in items:
        if "functional_postgres" in str(item.fspath):
            item.add_marker("postgres")
