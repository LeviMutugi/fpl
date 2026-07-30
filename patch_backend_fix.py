import re
import json

app_path = r'd:\Shi\my_shi\Skepsi\fpl\fpl\server\app.py'
with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the players[:150] with players
content = content.replace('for p in players[:150]:', 'for p in players:')

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("app.py updated to include ALL players in RAW array.")
