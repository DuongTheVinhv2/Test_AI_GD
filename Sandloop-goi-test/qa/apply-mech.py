"""Copy the best layouts found by qa/mech-search.ts (qa/results/mech-L<n>.json) into src/core/level-data.ts.
Run: python qa/apply-mech.py 11 12 15
Only the bucket grid and the tunnel queues change; tiles, rods and everything else stay as written by hand.
"""
import json
import re
import sys

path = 'src/core/level-data.ts'
src = open(path, encoding='utf-8').read()

for n in sys.argv[1:]:
    d = json.load(open(f'qa/results/mech-L{n}.json', encoding='utf-8'))
    start = src.index(f'    id: {n},')
    end = src.index('\n  },', start)
    block = src[start:end]
    rows = ',\n'.join('      [' + ', '.join("'%s'" % t for t in row) + ']' for row in d['buckets'])
    block = re.sub(r"    buckets: \[\n.*?\n    \],", '    buckets: [\n' + rows + ',\n    ],', block, flags=re.S)
    for t in d.get('tunnels', []) or []:
        q = '[' + ', '.join("'%s'" % c for c in t['queue']) + ']'
        pat = r"(\{ r: %d, c: %d, dir: '%s', queue: )\[[^\]]*\]" % (t['r'], t['c'], t['dir'])
        block = re.sub(pat, lambda m: m.group(1) + q, block)
    src = src[:start] + block + src[end:]
    print('applied', n)

open(path, 'w', encoding='utf-8').write(src)
