import io, re
s = io.open('dist/assets/app.js', encoding='utf-8').read()
# 找 confirmOpsDraft：追加版本 + 写回 opsPlans
for m in re.finditer(r'opsVersions', s):
    seg = s[max(0, m.start() - 400):m.start() + 120]
    if 'confirmDate' in seg and '已确认' in seg:
        print('IDX', m.start())
        print(repr(seg))
        print('---')
        break
