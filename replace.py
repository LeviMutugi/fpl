import re

file_path = r'd:\Shi\my_shi\Skepsi\fpl\fpl\FPL Research Console.dc.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update font imports
content = re.sub(
    r'<link href="https://fonts\.googleapis\.com/css2\?family=Space\+Grotesk.*?rel="stylesheet">',
    r'<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
    content
)

# 2. Update font families
content = content.replace("'Space Grotesk',sans-serif", "'Outfit', sans-serif")
content = content.replace('"Helvetica Neue",Helvetica,Arial,sans-serif', "'Inter', sans-serif")
content = content.replace("'Helvetica Neue',Helvetica,sans-serif", "'Inter', sans-serif")
content = content.replace("'JetBrains Mono',monospace", "'Inter', sans-serif")

# 3. Update main colors (Dark to Light)
# Backgrounds
content = content.replace('background:#08090b', 'background:#F8FAFC')
content = content.replace('background:#0a0b0e', 'background:#FFFFFF')
content = content.replace('background:#0b0d10', 'background:#FFFFFF')
content = content.replace('background:#0d0f13', 'background:#F1F5F9')
content = content.replace('background:#0e1014', 'background:#FFFFFF')
content = content.replace('background:#0b100d', 'background:#F8FAFC')
content = content.replace('background:#1c2028', 'background:#FFFFFF')
content = content.replace('background:#101317', 'background:#E2E8F0')

# Text colors
content = content.replace('color:#e6e8ec', 'color:#0F172A')
content = content.replace('color:#f2f4f7', 'color:#0F172A')
content = content.replace('color:#eceef2', 'color:#0F172A')
content = content.replace('color:#dfe2e8', 'color:#1E293B')
content = content.replace('color:#c8ccd4', 'color:#1E293B')

# Secondary text colors
content = content.replace('color:#8b919c', 'color:#64748B')
content = content.replace('color:#7d838f', 'color:#64748B')
content = content.replace('color:#6d737f', 'color:#64748B')
content = content.replace('color:#5d636e', 'color:#64748B')
content = content.replace('color:#565c66', 'color:#94A3B8')

# Borders / Dividers
content = content.replace('background:#4a505a', 'background:#CBD5E1')
content = content.replace('background:#3b414c', 'background:#CBD5E1')

# Replace rgba(255,255,255,...) with rgba(0,0,0,...) for borders and overlays
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.014\)', 'rgba(0,0,0,.02)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.016\)', 'rgba(0,0,0,.02)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.04\)', 'rgba(0,0,0,.04)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.045\)', 'rgba(0,0,0,.04)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.05\)', 'rgba(0,0,0,.05)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.06\)', 'rgba(0,0,0,.06)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.07\)', 'rgba(0,0,0,.08)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.08\)', 'rgba(0,0,0,.10)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.09\)', 'rgba(0,0,0,.12)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.1\)', 'rgba(0,0,0,.15)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.12\)', 'rgba(0,0,0,.18)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.13\)', 'rgba(0,0,0,.20)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.14\)', 'rgba(0,0,0,.22)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.16\)', 'rgba(0,0,0,.25)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.2\)', 'rgba(0,0,0,.30)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.24\)', 'rgba(0,0,0,.35)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.26\)', 'rgba(0,0,0,.40)', content)
content = re.sub(r'rgba\(255,\s*255,\s*255,\s*\.35\)', 'rgba(0,0,0,.50)', content)

# 4. Curvy design - increasing border radii
# Replace exact border-radius values
radii_map = {
    'border-radius:2px': 'border-radius:6px',
    'border-radius:3px': 'border-radius:8px',
    'border-radius:4px': 'border-radius:10px',
    'border-radius:5px': 'border-radius:12px',
    'border-radius:6px': 'border-radius:14px',
    'border-radius:7px': 'border-radius:16px',
    'border-radius:8px': 'border-radius:18px',
    'border-radius:9px': 'border-radius:20px',
    'border-radius:12px': 'border-radius:24px',
    'border-radius:13px': 'border-radius:28px',
    'border-radius:16px': 'border-radius:32px',
}
for old, new in radii_map.items():
    content = content.replace(old, new)

# 5. Make gradients lighter
content = content.replace('linear-gradient(168deg,#1c2028 0%,#0e1014 62%)', 'linear-gradient(168deg,#ffffff 0%,#f8fafc 100%)')
content = content.replace('linear-gradient(150deg,oklch(.42 .07 196),#0d1013)', 'linear-gradient(150deg,oklch(.9 .05 200),#ffffff)')

# 6. Adjust shadows
content = content.replace('box-shadow:0 14px 30px -16px rgba(0,0,0,.95)', 'box-shadow:0 14px 30px -10px rgba(0,0,0,.15)')

# 7. Add Player Images to XI Cards
card_pattern = r'(<div onClick="\{\{ c\.open \}\}".*?style="position:relative;width:98px;height:128px.*?>)'
img_tag = r'\1\n<img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p{{ c.code || 0 }}.png" onerror="this.src=\'https://ui-avatars.com/api/?name={{ c.last }}&background=f1f5f9&color=64748b&size=128&rounded=true\'" style="position:absolute; right: -5px; bottom: 0; width: 85px; object-fit: contain; z-index: 0; opacity: 0.95; -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%); mask-image: linear-gradient(to top, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);">'
content = re.sub(card_pattern, img_tag, content)

# Bring the player info above the image by setting z-index
content = content.replace('<div style="position:absolute;left:12px;right:9px;bottom:30px">', '<div style="position:absolute;left:12px;right:9px;bottom:30px;z-index:1;">')
content = content.replace('<div style="position:absolute;left:12px;right:9px;bottom:9px">', '<div style="position:absolute;left:12px;right:9px;bottom:9px;z-index:1;">')
content = content.replace('<div style="position:relative;padding:9px 9px 0 12px;display:flex;align-items:flex-start;justify-content:space-between">', '<div style="position:relative;padding:9px 9px 0 12px;display:flex;align-items:flex-start;justify-content:space-between;z-index:1;">')

# Also fix the top nav background color and border
content = content.replace('background:rgba(8,9,11,.86)', 'background:rgba(255,255,255,.86)')
content = content.replace('border:2px solid #08090b', 'border:2px solid #ffffff')

# Add subtle hover for the main UI cards
content = content.replace('style-hover="transform:translateY(-4px);border-color:rgba(255,255,255,.26)"', 'style-hover="transform:translateY(-4px);border-color:rgba(0,0,0,.26);box-shadow:0 20px 40px -12px rgba(0,0,0,.2)"')


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("UI update applied successfully.")
