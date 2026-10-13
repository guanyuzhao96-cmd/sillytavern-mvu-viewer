from pathlib import Path
import json,uuid,zipfile,hashlib
p=Path(__file__).resolve().parent
source='\n'.join((p/x).read_text() for x in ['core.js','ui.js','host.js'])
(p/'MVU数据查看器_v1.0.js').write_text(source)
payload={'type':'script','enabled':True,'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'tavernweave:mvu-viewer:v1')),'name':'MVU 数据查看器 v1.0','content':source,'info':'中文模块概览；历史只读，最新楼编辑；导入导出；无需额外 AI API。实机兼容性待验收。','button':{'enabled':True,'buttons':[{'name':'MVU 数据','visible':True}]},'data':{},'export_with':{'data':False,'button':True}}
(p/'MVU数据查看器_导入酒馆助手_v1.0.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
demo='\n'.join((p/x).read_text() for x in ['core.js','ui.js','demo.js']).replace('</script','<\\/script')
(p/'MVU数据查看器_交互预览_v1.0.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MVU 数据查看器 · 交互演示</title><body style="margin:0;background:#e9eff4"><button id="reopen" hidden style="margin:24px;padding:12px">重新打开演示</button><script>'+demo+'</script></body></html>')
files=[x for x in p.iterdir() if x.is_file() and x.suffix not in ['.zip','.png'] and x.name!='校验清单.json']
(p/'校验清单.json').write_text(json.dumps({x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in files},ensure_ascii=False,indent=2))
with zipfile.ZipFile(p.parent/'MVU数据查看器_v1.0完整包.zip','w',zipfile.ZIP_DEFLATED) as z:
    for x in p.iterdir():
        if x.is_file() and x.suffix not in ['.png']:
            z.write(x,'MVU数据查看器_v1.0/'+x.name)
print('构建完成；导入 JSON 与 JS 源码内容完全一致。')
