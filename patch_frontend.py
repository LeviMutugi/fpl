import re

html_path = r'd:\Shi\my_shi\Skepsi\fpl\fpl\FPL Research Console.dc.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the map function inside pool() to capture the 6th element (the player code)
# Original: this._pool = this.RAW.map(([name,team,pos,price,base])=>{
# New: this._pool = this.RAW.map(([name,team,pos,price,base,code])=>{
content = content.replace(
    'this._pool = this.RAW.map(([name,team,pos,price,base])=>{',
    'this._pool = this.RAW.map(([name,team,pos,price,base,code])=>{'
)

# Also inside pool(), add the code to the returned object.
# Find: return {id,name,team,pos,price,base,xp,cons,sd,pStart,mins:pStart*90}
# Replace: return {id,code,name,team,pos,price,base,xp,cons,sd,pStart,mins:pStart*90}
content = content.replace(
    'return {id,name,team,pos,price,base,xp,cons,sd,pStart,mins:pStart*90}',
    'return {id,code,name,team,pos,price,base,xp,cons,sd,pStart,mins:pStart*90}'
)

# 2. Update the xi mapping to pass the code along
# Find: xi:coords.map((c,i)=>({x:c.x,y:c.y,z:String(10+i),last:c.p.last,team:c.p.team,pos:c.p.pos,
# Replace: xi:coords.map((c,i)=>({x:c.x,y:c.y,z:String(10+i),code:c.p.code,last:c.p.last,team:c.p.team,pos:c.p.pos,
content = content.replace(
    'xi:coords.map((c,i)=>({x:c.x,y:c.y,z:String(10+i),last:c.p.last,team:c.p.team,pos:c.p.pos,',
    'xi:coords.map((c,i)=>({x:c.x,y:c.y,z:String(10+i),code:c.p.code,last:c.p.last,team:c.p.team,pos:c.p.pos,'
)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("HTML template patched to support real player codes.")
