const btnIniciar = document.getElementById('iniciar');
const btnCancelar = document.getElementById('cancelar');
const msg = document.getElementById('mensaje');

async function jugar() {
  const cuenta = document.getElementById('usuario').value.trim();
  const password = document.getElementById('clave').value;
  const server = document.getElementById('servidor').value || 's1';

  btnIniciar.disabled = true;
  msg.textContent = 'Conectando...';

  const res = await window.api.jugar({ cuenta, password, server });

  msg.textContent = res.ok ? 'Abriendo el juego...' : res.error;
  btnIniciar.disabled = false;
  if (res.ok) document.getElementById('clave').value = '';
}

btnIniciar.addEventListener('click', jugar);

// Enter en cualquiera de los campos también inicia sesión
document.getElementById('clave').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jugar();
});
document.getElementById('usuario').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jugar();
});

btnCancelar.addEventListener('click', () => window.close());