#!/usr/bin/env python3
from pathlib import Path
import re, hashlib
from decimal import Decimal, getcontext
getcontext().prec = 40

layers_dir = Path('data/layers')
js_files = sorted(layers_dir.glob('*.js'))
obj_pattern = re.compile(r"\{[^}]*\"uid\"\s*:\s*\"(?P<uid>[^\"]+)\"(?P<body>[^}]*?)\}", re.S)
coord_pattern = re.compile(r'\"(x|y)\"\s*:\s*([0-9]+(?:\.[0-9]+)?)')

changed_files = []
summary = {}

for fp in js_files:
    text = fp.read_text(encoding='utf-8')
    new_parts = []
    last = 0
    changed = False
    file_count = 0
    for m in obj_pattern.finditer(text):
        new_parts.append(text[last:m.start()])
        obj_text = m.group(0)
        uid = m.group('uid')
        # use mutable containers to allow inner function to update state
        state = {'changed': False, 'count': 0}
        def repl(match):
            name = match.group(1)
            orig_s = match.group(2)
            try:
                d = Decimal(orig_s)
            except Exception:
                return match.group(0)
            # count decimals in original literal
            if '.' in orig_s:
                dec_count = len(orig_s.split('.',1)[1])
            else:
                dec_count = 0
            # deterministic tiny jitter based on uid+name
            h = int(hashlib.md5((uid+name).encode('utf-8')).hexdigest()[:8], 16)
            # jitter up to 999 / 1e20 -> ~1e-17
            jitter = (Decimal(h % 1000) / Decimal(10) ** 20)
            if dec_count >= 16:
                newd = d.quantize(Decimal('0.' + '0'*15 + '1'))
            else:
                newd = (d + jitter).quantize(Decimal('0.' + '0'*15 + '1'))
            state['count'] += 1
            if str(newd) != orig_s:
                state['changed'] = True
            # Build final 16-decimal fractional part deterministically from the original literal
            # Parse original literal's integer and fractional parts
            if '.' in orig_s:
                orig_int, orig_frac = orig_s.split('.', 1)
            else:
                orig_int, orig_frac = orig_s, ''
            # Start with the quantized/new value's integer part and base fractional
            new_s = format(newd, 'f')
            if '.' in new_s:
                intpart, base_frac = new_s.split('.', 1)
            else:
                intpart, base_frac = new_s, ''
            # If base_frac is shorter than 16, or if original had trailing zeros, fill/replace
            hexstr = hashlib.md5((uid+name).encode('utf-8')).hexdigest()
            # Prepare deterministic digit stream from hexstr
            digits_stream = ''.join(str(int(c, 16) % 10) for c in hexstr)
            # If base fractional is shorter than 16, append deterministic digits
            if len(base_frac) < 16:
                needed = 16 - len(base_frac)
                extra = (digits_stream * ((needed // len(digits_stream)) + 1))[:needed]
                final_frac = (base_frac + extra)[:16]
            else:
                final_frac = base_frac[:16]
            # If the original fractional had trailing zeros, replace those trailing zeros
            if orig_frac.endswith('0'):
                # count trailing zeros in original (up to 16)
                tz = min(16, len(orig_frac) - len(orig_frac.rstrip('0')))
                if tz > 0:
                    # replace the last tz digits of final_frac with deterministic digits
                    replace_digits = (digits_stream * ((tz // len(digits_stream)) + 1))[:tz]
                    final_frac = final_frac[:16-tz] + replace_digits
            new_s = intpart + '.' + final_frac
            # mark changed if final literal differs from original
            if new_s != orig_s:
                state['changed'] = True
            return '"%s": %s' % (name, new_s)
        obj_new = coord_pattern.sub(repl, obj_text)
        file_count += state['count']
        if state['changed']:
            changed = True
        new_parts.append(obj_new)
        last = m.end()
    new_parts.append(text[last:])
    new_text = ''.join(new_parts)
    if changed and new_text != text:
        fp.write_text(new_text, encoding='utf-8')
        changed_files.append(fp)
        summary[str(fp)] = file_count

print('Modified files:', len(changed_files))
for k,v in summary.items():
    print(k, 'coords updated:', v)

# exit code
