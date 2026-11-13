# Sistema de multicuentas (solo el menú, sin la barra)

Este archivo trae únicamente el sistema de multicuentas: el menú desplegable del botón "+ Cuenta".
La barra, sus botones y su diseño NO se tocan.

## 1. HTML

En la barra YA existe un botón "+ Cuenta". No se crea uno nuevo: se envuelve el que ya está y se le agrega `id="accBtn"`.
El menú (`acc-menu`) va justo después del botón, dentro del mismo `acc-wrap`.

```html
<div class="acc-wrap">
  <!-- Botón "+ Cuenta" existente: dejarlo igual, solo agregarle id="accBtn" -->
  <button id="accBtn">+ Cuenta</button>

  <div class="acc-menu" id="accMenu">
    <div class="acc-title" id="accTitle"></div>
    <div id="accList"></div>
    <div class="acc-sep"></div>
    <button class="acc-add" id="accAdd">+ Añadir cuenta</button>
    <div class="acc-form" id="accForm">
      <input id="accNew" placeholder="Nombre de la cuenta" maxlength="24">
      <button id="accSave">Guardar</button>
    </div>
  </div>
</div>
```

## 2. CSS

Todas las clases empiezan con `acc-` para no chocar con las clases que ya existen.

```css
.acc-wrap{position:relative;-webkit-app-region:no-drag}
.acc-menu{position:absolute;top:calc(100% + 8px);right:0;width:290px;background:#142238;border:1px solid #2a3f5e;border-radius:10px;box-shadow:0 14px 40px #000a;padding:6px;display:none;z-index:1000;-webkit-app-region:no-drag}
.acc-menu.open{display:block}
.acc-title{font-size:11px;color:#8e9db4;padding:6px 8px 8px}
.acc-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:7px;cursor:pointer}
.acc-row:hover,.acc.open .acc-row{background:#1c2e48}
.acc-avatar{width:28px;height:28px;border-radius:7px;background:#23395a;display:grid;place-items:center;font-size:13px;color:#f0cb7c;flex:0 0 auto}
.acc-name{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acc-del{border:0;background:none;color:#7f90a8;font-size:16px;width:24px;height:24px;border-radius:5px;cursor:pointer}
.acc-del:hover{background:#ef777722;color:#ef7777}
.acc-opts{display:none;padding:2px 8px 8px 46px;flex-direction:column;gap:6px}
.acc.open .acc-opts{display:flex}
.acc-opt{border:0;background:#0f1a2c;color:#e8edf6;font:12px inherit;font-family:inherit;text-align:left;padding:8px 10px;border-radius:6px;cursor:pointer}
.acc-opt:hover{background:#243a5c}
.acc-confirm{display:flex;align-items:center;gap:6px;padding:8px;background:#2a1c26;border:1px solid #5a2f3a;border-radius:7px}
.acc-confirm span{flex:1;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acc-confirm button{border:0;border-radius:6px;padding:6px 9px;font:600 12px inherit;font-family:inherit;cursor:pointer}
.acc-confirm .no{background:#23395a;color:#e8edf6}
.acc-confirm .yes{background:#c0505a;color:#fff}
.acc-empty{padding:14px 8px;font-size:12px;color:#8e9db4}
.acc-sep{height:1px;background:#2a3f5e;margin:6px 2px}
.acc-add{width:100%;border:0;background:none;color:#ffe0a0;font:600 13px inherit;font-family:inherit;text-align:left;padding:9px 8px;border-radius:7px;cursor:pointer}
.acc-add:hover{background:#1c2e48}
.acc-form{display:none;padding:4px 6px 6px;gap:6px}
.acc-form.show{display:flex}
.acc-form input{flex:1;min-width:0;background:#0b1422;border:1px solid #344964;border-radius:6px;padding:8px;color:#e8edf6;font-size:13px;outline:none}
.acc-form input:focus{border-color:#e9ad35}
.acc-form button{border:0;background:#e9ad35;color:#211708;font-weight:700;border-radius:6px;padding:0 12px;cursor:pointer}
```

## 3. JavaScript

Solo diseño: las cuentas son una lista de ejemplo y las acciones de abrir no hacen nada real todavía (hay un comentario donde conectar la lógica después).

```js
(function(){
  let accounts=['GuerreroPrincipal','CuentaSecundaria','Cuenta de farmeo'];
  let openIndex=-1, confirmIndex=-1;
  const $=id=>document.getElementById(id);
  const btn=$('accBtn'), menu=$('accMenu'), list=$('accList');

  function render(){
    $('accTitle').textContent=accounts.length===1?'1 cuenta conectada':accounts.length+' cuentas conectadas';
    list.innerHTML='';
    if(!accounts.length){list.innerHTML='<div class="acc-empty">Aún no tienes cuentas.</div>';return}
    accounts.forEach((name,i)=>{
      const el=document.createElement('div');
      el.className='acc'+(i===openIndex?' open':'');
      if(i===confirmIndex){
        el.innerHTML='<div class="acc-confirm"><span>¿Eliminar <b></b>?</span><button class="no">Cancelar</button><button class="yes">Eliminar</button></div>';
        el.querySelector('b').textContent=name;
        el.querySelector('.no').onclick=()=>{confirmIndex=-1;render()};
        el.querySelector('.yes').onclick=()=>{accounts.splice(i,1);confirmIndex=-1;openIndex=-1;render()};
        list.appendChild(el);return;
      }
      el.innerHTML='<div class="acc-row"><div class="acc-avatar"></div><span class="acc-name"></span><button class="acc-del" title="Eliminar cuenta">×</button></div>'+
        '<div class="acc-opts"><button class="acc-opt" data-m="same">Abrir en esta ventana</button><button class="acc-opt" data-m="new">Abrir en ventana nueva</button></div>';
      el.querySelector('.acc-avatar').textContent=name.charAt(0).toUpperCase();
      el.querySelector('.acc-name').textContent=name;
      el.querySelector('.acc-row').onclick=e=>{
        if(e.target.closest('.acc-del'))return;
        confirmIndex=-1;openIndex=openIndex===i?-1:i;render();
      };
      el.querySelector('.acc-del').onclick=()=>{confirmIndex=i;openIndex=-1;render()};
      el.querySelectorAll('.acc-opt').forEach(o=>o.onclick=()=>{
        // AQUÍ irá la lógica real más adelante: o.dataset.m es "same" o "new", y name es la cuenta
        console.log(o.dataset.m,name);
        close();
      });
      list.appendChild(el);
    });
  }
  function close(){
    menu.classList.remove('open');$('accForm').classList.remove('show');$('accAdd').style.display='';
    openIndex=-1;confirmIndex=-1;render();
  }
  btn.addEventListener('click',e=>{e.stopPropagation();menu.classList.contains('open')?close():menu.classList.add('open')});
  menu.addEventListener('click',e=>e.stopPropagation());
  document.addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  $('accAdd').onclick=()=>{$('accAdd').style.display='none';$('accForm').classList.add('show');$('accNew').focus()};
  function save(){
    const v=$('accNew').value.trim(); if(!v)return $('accNew').focus();
    accounts.push(v);$('accNew').value='';
    $('accForm').classList.remove('show');$('accAdd').style.display='';render();
  }
  $('accSave').onclick=save;
  $('accNew').addEventListener('keydown',e=>{if(e.key==='Enter')save()});
  render();
})();
```

## 4. Prompt para la IA

```
Quiero que agregues un sistema de multicuentas al launcher usando el código del archivo multicuentas-sistema.md (HTML, CSS y JS).

Reglas importantes:
- NO modifiques el diseño de la barra superior: ni su tamaño, colores, espacios, orden de los botones, ni los botones de Reiniciar y de minimizar/maximizar/cerrar. La barra debe quedar exactamente igual que ahora.
- Ya existe un botón "+ Cuenta" en la barra. NO crees otro. Solo agrégale id="accBtn" y envuélvelo con <div class="acc-wrap"> tal como indica la sección HTML. Conserva su estilo actual.
- Agrega el menú (acc-menu) dentro de ese mismo acc-wrap, el CSS con el resto de mis estilos y el JS en el archivo de scripts del launcher.
- Todas las clases nuevas empiezan con "acc-". No cambies ni renombres ninguna clase existente.
- Si la barra usa -webkit-app-region: drag, asegúrate de que el menú y el botón sigan funcionando (por eso ya llevan no-drag).
- Si el menú se ve cortado porque la barra es muy baja, avísame antes de cambiar tamaños de ventana o de vistas. No lo arregles tocando el diseño de la barra.
- No agregues lógica real todavía: es solo diseño. Deja la lista de cuentas de ejemplo y el comentario donde irá la lógica.
- Al terminar, dime exactamente qué archivos y líneas modificaste.
```
