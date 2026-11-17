import sys

from .cli import main

# Pipe'a yazarken Windows yerel kod sayfası yerine UTF-8 (alt süreç çıktısı da UTF-8 çözülür).
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")

sys.exit(main())
