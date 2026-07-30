import sqlite3

conn = sqlite3.connect('fpl_engine.db')
cur = conn.cursor()

print("=== Team Mapping Check ===")
names = ['Salah','Haaland','Kerkez','Kudus','Disasi','Wood','Rogers','Palmer','Elanga']
for name in names:
    cur.execute("SELECT p.web_name, p.team_code, t.short_name, t.code FROM players p JOIN teams t ON p.team_code = t.code WHERE p.web_name = ?", (name,))
    rows = cur.fetchall()
    for r in rows:
        print(f"  {r[0]}: team_code={r[1]}, team_short={r[2]}, t.code={r[3]}")

print("\n=== FPL API team vs team_code check ===")
cur.execute("SELECT id, code, short_name FROM teams ORDER BY id")
for r in cur.fetchall():
    print(f"  id={r[0]}, code={r[1]}, short={r[2]}")

print("\n=== Photo URL check ===")
cur.execute("SELECT web_name, photo_hd_url FROM players WHERE web_name IN ('Salah','Haaland','Saka') LIMIT 5")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

conn.close()
