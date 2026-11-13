import sys, time, random, ctypes, winsound
from pathlib import Path
import cv2, numpy as np, pyautogui, keyboard

# Que las coordenadas coincidan con la pantalla aunque Windows use escala (125%, 150%...)
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    pass

# ======================= AJUSTES =======================
CARPETA = Path(__file__).parent / "screens"

# --- Ritmo ---
INTERVALO_CLIC = 0.25        # segundos entre clics de orbe (0.5 = 2 clics por segundo)
VARIACION = 0.04            # +/- al azar para que no sea siempre idéntico
MOV_ORBE = (0.03, 0.06)     # lo que tarda el ratón en llegar al orbe

# --- Ciclo ---
MAX_VUELTAS = 4000           # clics en orbes por ejecución
SINTETIZAR_CADA = 15        # cada cuántos clics se pulsa Sintetizar (provisional)
BOTONES_CICLO = ("btn-sintetizar",)   # añade "btn-recoger" si lo quieres; Vender queda fuera
FALLOS_SEGUIDOS_MAX = 5     # veces seguidas sin ver ningún orbe antes de detenerse

# --- Detección ---
CONF = 0.85                 # parecido mínimo para dar algo por visto
CONF_PANEL = 0.80           # parecido mínimo para el panel "Astros"

# --- Ventanas de confirmación ---
AUTO_AVISO = True          # True: pulsa Confirmar solo en el Aviso normal
CONFIRMAR_YES = True       # True: hace clic en el campo y escribe "yes"
SOLO_ESCRIBIR_YES = False    # con CONFIRMAR_YES activo: escribe yes pero Confirmar lo pulsas tú
OFFSET_CAMPO_Y = 21         # si no ve campo-yes: píxeles bajo texto-yes donde hacer clic
PAUSA_UI = (0.5, 0.9)       # pausas en botones y ventanas (más prudentes)
MOV_UI = (0.12, 0.25)

pyautogui.FAILSAFE = True   # mover el ratón a una esquina de la pantalla lo detiene
pyautogui.PAUSE = 0

# ======================= VISIÓN =======================
_cache = {}

def plantilla(nombre):
    if nombre not in _cache:
        img = cv2.imread(str(CARPETA / f"{nombre}.png"), cv2.IMREAD_COLOR)
        if img is None:
            raise FileNotFoundError(f"Falta {nombre}.png en {CARPETA}")
        _cache[nombre] = img
    return _cache[nombre]

def captura():
    return cv2.cvtColor(np.array(pyautogui.screenshot()), cv2.COLOR_RGB2BGR)

def buscar(cap, nombre):
    """Devuelve (parecido, x_centro, y_centro, ancho, alto)."""
    t = plantilla(nombre)
    h, w = t.shape[:2]
    if cap.shape[0] < h or cap.shape[1] < w:
        return 0.0, 0, 0, w, h
    r = cv2.matchTemplate(cap, t, cv2.TM_CCOEFF_NORMED)
    _, mx, _, loc = cv2.minMaxLoc(r)
    return float(mx), loc[0] + w // 2, loc[1] + h // 2, w, h

def visible(cap, nombre, umbral=CONF):
    return buscar(cap, nombre)[0] >= umbral

# ======================= ACCIONES =======================
def parar():
    return keyboard.is_pressed("F8")

def esperar_hasta(momento):
    """Espera hasta 'momento' (time.time()). Devuelve False si se pulsó F8."""
    while time.time() < momento:
        if parar():
            return False
        time.sleep(0.01)
    return not parar()

def espera(a, b=None):
    time.sleep(random.uniform(a, b if b else a))

def mover_y_clic(x, y, w, h, mov):
    dx = random.randint(-max(1, w // 4), max(1, w // 4))
    dy = random.randint(-max(1, h // 4), max(1, h // 4))
    pyautogui.moveTo(x + dx, y + dy, duration=random.uniform(*mov))
    pyautogui.click()

def clic_ui(x, y, w=20, h=20):
    """Clic en botones y ventanas, con pausa prudente."""
    mover_y_clic(x, y, w, h, MOV_UI)
    espera(*PAUSA_UI)

def alarma(motivo):
    print(f"  >> PAUSA: {motivo}")
    winsound.Beep(1200, 500)

def esperar_que_desaparezca(nombre, limite=180):
    inicio = time.time()
    while time.time() - inicio < limite:
        if parar():
            return False
        if not visible(captura(), nombre):
            return True
        time.sleep(0.5)
        if int(time.time() - inicio) % 4 == 0:
            winsound.Beep(900, 200)
    return False

# ======================= VENTANAS DE CONFIRMACIÓN =======================
def hay_ventana(cap):
    return visible(cap, "texto-yes") or visible(cap, "aviso-titulo")

def manejar_ventanas():
    """Atiende el Aviso normal y la ventana del YES. Devuelve False si hay que detener el macro."""
    for _ in range(6):
        cap = captura()
        s_yes, xy, yy, wy, hy = buscar(cap, "texto-yes")

        if s_yes >= CONF:                                   # ventana del YES
            # FASE 3: aquí se leerá el nombre del astro y se comparará con la lista de protegidos
            if not CONFIRMAR_YES:
                alarma("ventana del YES: confirma tú")
                if not esperar_que_desaparezca("texto-yes"):
                    return False
            else:
                s_c, xc, yc, wc, hc = buscar(cap, "campo-yes")
                if s_c >= 0.7:
                    clic_ui(xc, yc, wc, hc)
                else:
                    clic_ui(xy, yy + OFFSET_CAMPO_Y, wy, hy)
                pyautogui.write("yes", interval=0.09)
                espera(0.4, 0.7)
                if SOLO_ESCRIBIR_YES:
                    alarma("yes escrito: pulsa Confirmar tú")
                    if not esperar_que_desaparezca("texto-yes"):
                        return False
                else:
                    s_b, xb, yb, wb, hb = buscar(captura(), "btn-confirmar")
                    if s_b < CONF:
                        alarma("no veo el botón Confirmar")
                        return False
                    clic_ui(xb, yb, wb, hb)
            espera(0.8, 1.2)
            continue

        if visible(cap, "aviso-titulo"):                    # Aviso normal
            s_b, xb, yb, wb, hb = buscar(cap, "btn-confirmar")
            if s_b < CONF:
                alarma("Aviso abierto sin botón Confirmar visible")
                return False
            if AUTO_AVISO:
                clic_ui(xb, yb, wb, hb)
                espera(0.8, 1.2)
                continue
            alarma("Aviso: confirma tú")
            if not esperar_que_desaparezca("aviso-titulo"):
                return False
            continue

        return True                                         # no hay ventanas
    return True

# ======================= LÓGICA DEL JUEGO =======================
def orbe_mas_alto(cap):
    """Orbe encendido más alto. El 1 es el punto de partida y se pulsa si no hay otro."""
    for n in (5, 4, 3, 2):
        s_on, x, y, w, h = buscar(cap, f"astro-{n}")
        if s_on >= CONF:
            s_off = buscar(cap, f"astro-{n}-off")[0]
            if s_on > s_off + 0.03:      # debe parecerse claramente más a "encendido"
                return n, x, y, w, h
    a = buscar(cap, "astro-1")
    b = buscar(cap, "astro-1-off")
    s, x, y, w, h = a if a[0] >= b[0] else b
    if s >= 0.70:
        return 1, x, y, w, h
    return None

def ciclo():
    for boton in BOTONES_CICLO:
        s, x, y, w, h = buscar(captura(), boton)
        if s >= CONF:
            clic_ui(x, y, w, h)
        else:
            print(f"  no veo {boton} ({s:.2f})")
        espera(0.8, 1.2)
        if not manejar_ventanas():
            return False
    return True

# ======================= MODOS =======================
def diagnostico():
    print("DIAGNÓSTICO (no hace clics).")
    print("Tienes 6 segundos: cambia a la ventana del juego con Astrales abierto.")
    for n in range(6, 0, -1):
        print(f"  {n}...")
        time.sleep(1)
    cap = captura()
    for p in sorted(CARPETA.glob("*.png")):
        s, x, y, _, _ = buscar(cap, p.stem)
        marca = "OK " if s >= CONF else "   "
        print(f"{marca} {p.stem:20s} parecido {s:.2f}  en ({x},{y})")
    print("\nLos que deben verse ahora deberían marcar 0.85 o más.")

def main():
    print("Macro de astros. F9 = empezar, F8 = parar (también: ratón a una esquina).")
    keyboard.wait("F9")

    clics = fallos = 0
    proc = 0.15                       # tiempo medio de visión + movimiento (se recalcula solo)
    avisado_lento = False
    t_clic = time.time()

    while clics < MAX_VUELTAS and not parar():
        # Se empieza a mirar un poco antes, para que el clic salga justo a los 0.5 s
        objetivo = t_clic + INTERVALO_CLIC + random.uniform(-VARIACION, VARIACION) - proc
        if not esperar_hasta(objetivo):
            break

        t0 = time.time()
        cap = captura()

        if hay_ventana(cap):
            if not manejar_ventanas():
                break
            t_clic = time.time()
            continue

        s_panel = buscar(cap, "panel-astrales")[0]
        if s_panel < CONF_PANEL:
            for _ in range(6):        # reintenta por si fue un destello o una animación
                time.sleep(0.5)
                cap = captura()
                s_panel = buscar(cap, "panel-astrales")[0]
                if s_panel >= CONF_PANEL:
                    break
        if s_panel < CONF_PANEL:
            cv2.imwrite("fallo.png", cap)
            print(f"  panel-astrales parecido {s_panel:.2f} (captura guardada en fallo.png)")
            alarma("no veo la ventana de Astrales")
            break

        orbe = orbe_mas_alto(cap)
        if orbe is None:
            fallos += 1
            print(f"  ningún orbe encendido ({fallos}/{FALLOS_SEGUIDOS_MAX})")
            if fallos >= FALLOS_SEGUIDOS_MAX:
                alarma("sin orbes encendidos: ¿sin oro o ventana distinta?")
                break
            t_clic = time.time() + 0.5
            continue
        fallos = 0

        n, x, y, w, h = orbe
        mover_y_clic(x, y, w, h, MOV_ORBE)
        ahora = time.time()
        clics += 1
        print(f"clic {clics}/{MAX_VUELTAS} en orbe {n}  ({ahora - t_clic:.2f}s desde el anterior)")
        proc = 0.8 * proc + 0.2 * (ahora - t0)
        t_clic = ahora

        if proc > INTERVALO_CLIC and not avisado_lento:
            print(f"  AVISO: la visión tarda {proc:.2f}s por vuelta, no se llega a {INTERVALO_CLIC}s por clic.")
            avisado_lento = True

        if clics % SINTETIZAR_CADA == 0:
            if not ciclo():
                break
            t_clic = time.time()

    print("Macro detenido.")

if __name__ == "__main__":
    try:
        diagnostico() if "--diagnostico" in sys.argv else main()
    except pyautogui.FailSafeException:
        print("Detenido por la esquina de la pantalla.")