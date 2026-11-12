const btnIniciar = document.getElementById('iniciar');
const btnCancelar = document.getElementById('cancelar');
const msg = document.getElementById('mensaje');
const campoUsuario = document.getElementById('usuario');
const campoClave = document.getElementById('clave');
const casillaRecordar = document.getElementById('recordar');
const listaCuentas = document.getElementById('listaCuentas');
const btnVerCuentas = document.getElementById('verCuentas');

let cuentas = [];

// Dibuja la lista de cuentas guardadas
function pintarCuentas() {
  listaCuentas.innerHTML = '';

  if (!cuentas.length) {
    const vacio = document.createElement('div');
    vacio.className = 'item-cuenta vacio';
    vacio.textContent = 'Sin cuentas guardadas';
    listaCuentas.appendChild(vacio);
    return;
  }

  cuentas.forEach((c) => {
    const fila = document.createElement('div');
    fila.className = 'item-cuenta';

    const texto = document.createElement('span');
    texto.className = 'texto';
    texto.textContent = c.usuario;

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'quitar';
    quitar.title = 'Quitar de la lista';
    quitar.textContent = '\u00d7';
    quitar.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        cuentas = await window.api.borrarCuenta(c.usuario);
        pintarCuentas();
      } catch (e) { /* si falla, se deja la lista como está */ }
    });

    fila.addEventListener('click', () => {
      campoUsuario.value = c.usuario;
      campoClave.value = c.recordar ? (c.password || '') : '';
      casillaRecordar.checked = !!c.recordar;
      listaCuentas.hidden = true;

      // solo rellena los datos: la conexión siempre la lanza el botón
      // (o Enter), nunca al elegir la cuenta
      if (c.recordar && c.password) btnIniciar.focus();
      else campoClave.focus();
    });

    fila.appendChild(texto);
    fila.appendChild(quitar);
    listaCuentas.appendChild(fila);
  });
}

btnVerCuentas.addEventListener('click', (e) => {
  e.stopPropagation();
  listaCuentas.hidden = !listaCuentas.hidden;
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo')) listaCuentas.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') listaCuentas.hidden = true;
});

// Rellena el formulario con lo último que se guardó
(async () => {
  try {
    const p = await window.api.prefsLeer();
    if (!p) return;
    if (p.usuario) campoUsuario.value = p.usuario;
    if (p.password) campoClave.value = p.password;
    casillaRecordar.checked = !!p.recordar;
    cuentas = p.cuentas || [];
    pintarCuentas();
  } catch (e) { /* sin preferencias guardadas */ }
})();

async function jugar() {
  const cuenta = campoUsuario.value.trim();
  const password = campoClave.value;
  const server = document.getElementById('servidor').value || 's1';
  const recordar = casillaRecordar.checked;

  btnIniciar.disabled = true;
  msg.textContent = 'Conectando...';

  let res;
  try {
    res = await window.api.jugar({ cuenta, password, server, recordar });
  } catch (e) {
    res = { ok: false, error: 'No se pudo conectar con el servidor.' };
  }

  // el usuario y la contraseña los guarda el proceso principal: al entrar,
  // esta ventana se cierra y ya no podría escribir nada
  if (res.ok) campoClave.value = '';

  msg.textContent = res.ok ? 'Abriendo el juego...' : res.error;
  btnIniciar.disabled = false;
}

btnIniciar.addEventListener('click', jugar);

// Enter en cualquiera de los campos también inicia sesión
campoClave.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jugar();
});
campoUsuario.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jugar();
});

btnCancelar.addEventListener('click', () => window.close());
