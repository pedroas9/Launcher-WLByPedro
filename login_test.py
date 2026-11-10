import requests, getpass, re, html, subprocess, os
from urllib.parse import urljoin, unquote

RUFFLE = r"D:\ruffle-nightly-2026_11_08-windows-x86_64\ruffle.exe" # cambia por tu ruta real

# ---------- 1. LOGIN ----------
CUENTA = input("Cuenta/Email: ")
PASSWORD = getpass.getpass("Contraseña: ")

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
    "Origin": "https://wartunelab.com",
    "Referer": "https://wartunelab.com/",
    "Accept": "*/*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "X-Requested-With": "portal",
})
session.cookies.set("lab_weblang", "es", domain="wartunelab.com")

payload = {"userOrEmail": CUENTA, "password": PASSWORD}
r_login = session.post("https://wartunelab.com/api/auth/login", data=payload)
print("Login:", r_login.status_code)
print("Cookies:", list(session.cookies.get_dict().keys()))

# ---------- 2. PÁGINA DEL JUEGO ----------
r = session.get("https://wartunelab.com/play", params={"server": "s1"})
print("URL final:", r.url)

# ---------- 3. EXTRAER SWF Y FLASHVARS ----------
m_swf = re.search(r'<embed[^>]*\bsrc="([^"]+\.swf[^"]*)"', r.text)
m_fv = re.search(r'flashvars="([^"]+)"', r.text)

if not (m_swf and m_fv):
    print("No encontré el embed o los flashvars. ¿Falló el login?")
    raise SystemExit(1)

swf_url = urljoin("https://wartunelab.com/", html.unescape(m_swf.group(1)))

# La página define una base para las rutas relativas del SWF (p. ej. base="/").
# Sin ella, Ruffle resuelve "resouececheck.sq" contra /client/ y recibe un manifiesto
# con md5 antiguos: el cliente falla con "文件解码失败" y luego MainLoadingAsset.
m_base = re.search(r'<embed[^>]*\bbase="([^"]+)"', r.text, re.I)
m_base_param = re.search(r'<param[^>]*\bname="base"[^>]*\bvalue="([^"]+)"', r.text, re.I)
if m_base:
    base_url = urljoin(swf_url, html.unescape(m_base.group(1)))
elif m_base_param:
    base_url = urljoin(swf_url, html.unescape(m_base_param.group(1)))
else:
    base_url = "https://wartunelab.com/"

flashvars = {
    k: unquote(v)
    for k, v in (p.split("=", 1) for p in html.unescape(m_fv.group(1)).split("&") if "=" in p)
}
print("SWF:", swf_url)
print("Base:", base_url)
print("FlashVars (nombres):", list(flashvars.keys()))

# ---------- 4. LANZAR CON RUFFLE ----------
if not os.path.exists(RUFFLE):
    print("No encuentro ruffle.exe en:", RUFFLE)
    raise SystemExit(1)

args = [RUFFLE]
args += ["--base", base_url]
args += ["--socket-allow", "wartunelab.com:5000"]
for k, v in flashvars.items():
    args += ["-P", f"{k}={v}"]
args.append(swf_url)

print("Abriendo el juego...")
subprocess.Popen(args)