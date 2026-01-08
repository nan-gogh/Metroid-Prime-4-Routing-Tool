#!/usr/bin/env python3
"""
Sort marker arrays in JS layer files located in data/layers by (y, x) ascending
(starting from upper-left (0,0)).

Usage:
    python tools/sort_layer_markers.py [--apply] [--dir data/layers]

By default the script shows what would change. Use --apply to overwrite files (a .bak
backup is written alongside the original file).

This script performs a best-effort extraction of the first top-level array literal
in each file and attempts to parse it as JSON after cleaning common JS syntax
(such as single quotes and trailing commas). It's intended for the project's
layer files which contain marker arrays.
"""

import argparse
import glob
import json
import os
import re
import sys


def find_first_top_level_array(s: str):
    """Return (start_index, end_index) of first top-level '[' ... ']' pair,
    ignoring strings and comments. Returns None if not found."""
    i = 0
    n = len(s)
    in_single = in_double = in_template = False
    in_line_comment = in_block_comment = False
    escape = False
    depth = 0
    start = None

    while i < n:
        ch = s[i]
        nxt = s[i+1] if i+1 < n else ''

        if in_line_comment:
            if ch == '\n':
                in_line_comment = False
        elif in_block_comment:
            if ch == '*' and nxt == '/':
                in_block_comment = False
                i += 1
        elif in_single:
            if not escape and ch == "'":
                in_single = False
            escape = (ch == "\\" and not escape)
        elif in_double:
            if not escape and ch == '"':
                in_double = False
            escape = (ch == "\\" and not escape)
        elif in_template:
            if not escape and ch == '`':
                in_template = False
            escape = (ch == "\\" and not escape)
        else:
            # not in string/comment
            if ch == '/' and nxt == '/':
                in_line_comment = True
                i += 1
            elif ch == '/' and nxt == '*':
                in_block_comment = True
                i += 1
            elif ch == "'":
                in_single = True
            elif ch == '"':
                in_double = True
            elif ch == '`':
                in_template = True
            elif ch == '[':
                if depth == 0:
                    start = i
                depth += 1
            elif ch == ']':
                if depth > 0:
                    depth -= 1
                    if depth == 0 and start is not None:
                        return start, i
        i += 1
    return None


def clean_js_array_text(s: str):
    # remove JS single-line and block comments
    s = re.sub(r'//.*(?=\n)', '', s)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    # convert single-quoted strings to double-quoted (best-effort)
    def _sq_to_dq(m):
        inner = m.group(1)
        inner = inner.replace('"', '\\"')
        return '"' + inner + '"'
    s = re.sub(r"'([^'\\]*(?:\\.[^'\\]*)*)'", _sq_to_dq, s)
    # remove trailing commas before ] or }
    s = re.sub(r',\s*(?=[\]}])', '', s)
    return s


def sort_markers(markers):
    # markers expected to be list of dicts with numeric 'x' and 'y'
    def keyfn(m):
        try:
            y = float(m.get('y', m.get('lat', 0)))
        except Exception:
            y = 0
        try:
            x = float(m.get('x', m.get('lon', 0)))
        except Exception:
            x = 0
        return (y, x)
    return sorted(markers, key=keyfn)


def process_file(path: str, apply: bool = False):
    txt = open(path, 'r', encoding='utf-8').read()
    loc = find_first_top_level_array(txt)
    if not loc:
        print(f"[SKIP] {path}: no top-level array found")
        return False
    start, end = loc
    array_text = txt[start:end+1]
    cleaned = clean_js_array_text(array_text)
    try:
        data = json.loads(cleaned)
    except Exception as e:
        print(f"[ERROR] {path}: failed to parse array as JSON: {e}")
        return False
    if not isinstance(data, list):
        print(f"[SKIP] {path}: top-level array is not a list")
        return False
    # check likely marker object structure
    if not data:
        print(f"[OK] {path}: empty array")
        return False
    if not isinstance(data[0], dict):
        print(f"[SKIP] {path}: array elements are not objects")
        return False

    sorted_data = sort_markers(data)
    if sorted_data == data:
        print(f"[NOCHANGE] {path}: already sorted")
        return True
    # prepare replacement JSON preserving compactness/style
    new_json = json.dumps(sorted_data, indent=4, ensure_ascii=False)

    new_txt = txt[:start] + new_json + txt[end+1:]
    if apply:
        bak = path + '.bak'
        open(bak, 'w', encoding='utf-8').write(txt)
        open(path, 'w', encoding='utf-8').write(new_txt)
        print(f"[UPDATED] {path}: sorted and written (backup: {os.path.basename(bak)})")
    else:
        print(f"[WILL-UPDATE] {path}: would rewrite array (use --apply to write)")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='data/layers', help='directory with layer files')
    ap.add_argument('--apply', action='store_true', help='apply changes to files')
    ap.add_argument('--pattern', default='*.js', help='file pattern in dir')
    args = ap.parse_args()

    base = os.path.abspath(args.dir)
    pattern = os.path.join(base, args.pattern)
    files = sorted(glob.glob(pattern))
    if not files:
        print('No files found in', pattern)
        sys.exit(1)
    ok = 0
    for f in files:
        try:
            res = process_file(f, apply=args.apply)
            if res:
                ok += 1
        except Exception as e:
            print(f"[ERROR] {f}: {e}")
    print(f"Processed {len(files)} files, {ok} processed/succeeded.")

if __name__ == '__main__':
    main()
