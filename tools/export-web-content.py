#!/usr/bin/env python3
"""Exports the offline study content from the iOS Swift sources to docs/data.js,
so the iPhone app and the web app share one question bank.

Usage: python3 tools/export-web-content.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "PhoneLock" / "Content"


def swift_strings(src):
    """Yields (start, end, value) for every Swift string literal in src (no interpolation support needed)."""
    i = 0
    while i < len(src):
        if src.startswith('"""', i):
            end = src.index('"""', i + 3)
            body = src[i + 3:end]
            lines = body.split("\n")[1:-1]
            indent = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
            yield i, end + 3, "\n".join(l[indent:] for l in lines)
            i = end + 3
        elif src[i] == '"':
            j, out = i + 1, []
            while src[j] != '"':
                if src[j] == "\\":
                    out.append({"n": "\n", "t": "\t"}.get(src[j + 1], src[j + 1]))
                    j += 2
                else:
                    out.append(src[j])
                    j += 1
            yield i, j + 1, "".join(out)
            i = j + 1
        else:
            i += 1


def parse_pairs(raw):
    pairs = []
    for line in raw.split("\n"):
        if "|" in line:
            a, b = (p.strip() for p in line.split("|", 1))
            if a and b:
                pairs.append([a, b])
    return pairs


def decks():
    src = (CONTENT / "Decks.swift").read_text()
    raw = {}
    for m in re.finditer(r'static let (\w+) = """', src):
        start = m.end() - 3
        _, _, value = next(swift_strings(src[start:]))
        raw[m.group(1)] = parse_pairs(value)

    # Capital tuples: ("geo.cap.europe", "Capitals: Europe", """ ... """)
    capitals = []
    for m in re.finditer(r'\("(geo\.cap\.\w+)", "([^"]+)", """', src):
        _, _, value = next(swift_strings(src[m.end() - 3:]))
        capitals.append({"id": m.group(1), "name": m.group(2), "pairs": parse_pairs(value)})

    # Deck list: read the `all` builder so names/templates stay in sync.
    body = src[src.index("static var all"):src.index("// MARK: - Data")]
    out = []
    for line in body.split("\n"):
        line = line.strip()
        if "for (id, name, raw) in capitals" in line:
            for c in capitals:
                out.append({"id": c["id"], "name": c["name"], "subject": "geography",
                            "forward": "What is the capital of %@?", "reverse": "%@ is the capital of…",
                            "pairs": c["pairs"]})
            continue
        m = re.match(r'out \+= chunked\(id: "([^"]+)", name: "([^"]+)", subject: \.(\w+), forward: "((?:[^"\\]|\\.)*)", '
                     r'reverse: (nil|"(?:[^"\\]|\\.)*"), raw: (\w+), size: (\d+)\)', line)
        if m:
            did, name, subject, fwd, rev, var, size = m.groups()
            pairs, size = raw[var], int(size)
            chunks = [pairs[i:i + size] for i in range(0, len(pairs), size)]
            for n, chunk in enumerate(chunks, 1):
                roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][min(n, 10) - 1]
                out.append({"id": f"{did}.{n}", "name": f"{name} {roman}" if len(chunks) > 1 else name,
                            "subject": subject, "forward": fwd, "reverse": None if rev == "nil" else rev[1:-1],
                            "pairs": chunk})
            continue
        m = re.match(r'out\.append\(\("([^"]+)", "([^"]+)", \.(\w+), Deck\(forward: "((?:[^"\\]|\\.)*)", '
                     r'reverse: (nil|"(?:[^"\\]|\\.)*"), pairs: parse\((\w+)\)\)\)\)', line)
        if m:
            did, name, subject, fwd, rev, var = m.groups()
            out.append({"id": did, "name": name, "subject": subject, "forward": fwd,
                        "reverse": None if rev == "nil" else rev[1:-1], "pairs": raw[var]})
    return out


def reading_writing():
    src = (CONTENT / "SATReadingWriting.swift").read_text()
    topics = []
    headers = list(re.finditer(r'\("(sat\.\w+)", "([^"]+)", \[', src))
    for k, h in enumerate(headers):
        end = headers[k + 1].start() if k + 1 < len(headers) else len(src)
        block = src[h.end():end]
        questions = []
        for call in re.finditer(r'\bb\("sat\.\w+", (\d+), ', block):
            rest = block[call.end():]
            strings = []
            for s, e, v in swift_strings(rest):
                strings.append(v)
                if len(strings) == 6:
                    break
            prompt, answer, w1, w2, w3, why = strings
            questions.append({"id": f"{h.group(1)}#{call.group(1)}", "prompt": prompt, "answer": answer,
                              "wrong": [w1, w2, w3], "explanation": why})
        topics.append({"id": h.group(1), "name": h.group(2), "questions": questions})
    return topics


def ai_topics():
    src = (CONTENT / "AITopics.swift").read_text()
    out = []
    for m in re.finditer(r'\(\.(\w+), \[(.*?)\]\)', src, re.S):
        out.append({"subject": m.group(1), "names": [v for _, _, v in swift_strings(m.group(2))]})
    return out


def main():
    data = {"decks": decks(), "readingWriting": reading_writing(), "aiTopics": ai_topics()}
    js = ("// Generated by tools/export-web-content.py from the iOS Swift content. Do not edit by hand.\n"
          "window.PL_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    (ROOT / "docs" / "data.js").write_text(js)
    print(f"decks: {len(data['decks'])}, R&W topics: {len(data['readingWriting'])} "
          f"({sum(len(t['questions']) for t in data['readingWriting'])} questions), "
          f"AI topics: {sum(len(g['names']) for g in data['aiTopics'])}")


if __name__ == "__main__":
    main()
