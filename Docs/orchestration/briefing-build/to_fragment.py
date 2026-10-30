import re, sys, html
src, frag_out, text_out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding="utf-8").read()

# 1. Fragment for the Artifact tool: it adds doctype/html/head/body, charset and viewport itself.
f = s
f = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>\s*", "", f, count=1, flags=re.I)
f = re.sub(r'<meta charset="utf-8">\s*', "", f, count=1, flags=re.I)
f = re.sub(r'<meta name="viewport"[^>]*>\s*', "", f, count=1, flags=re.I)
f = re.sub(r"</head>\s*<body[^>]*>", "", f, count=1, flags=re.I)
f = re.sub(r"</body>\s*</html>\s*$", "", f, flags=re.I)
open(frag_out, "w", encoding="utf-8").write(f)
print("fragment bytes", len(f.encode("utf-8")))
print("leftover wrapper tags:", [t for t in ("<!doctype", "<html", "<head", "</head", "<body", "</body", "</html") if t in f.lower()])

# 2. Plain text for reading.
t = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", s, flags=re.S | re.I)
t = re.sub(r"</(p|div|li|h[1-6]|tr|summary|details|section|article|table|ul|ol)>", "\n", t, flags=re.I)
t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
t = re.sub(r"<[^>]+>", " ", t)
t = html.unescape(t)
t = re.sub(r"[ \t\r\f\v]+", " ", t)
t = re.sub(r"\n\s*\n+", "\n", t)
open(text_out, "w", encoding="utf-8").write(t)
print("text chars", len(t), "lines", t.count("\n"))

# 3. Things that would be blocked or inert in the viewer.
for pat in ["window.print", "mailto:", "download=", "<iframe", "<embed", "<object", "http://", "https://"]:
    hits = [m for m in re.findall(r"[^\s\"']*" + re.escape(pat) + r"[^\s\"']*", s)]
    if hits:
        print(pat, len(hits), sorted(set(hits))[:6])
