# Shiny Hunt dos Crias ✨

Contador de shiny hunt da **5ª geração (Unova, #494–#649)** para a dupla PH + Thivez.
Cada um abre o link na sua casa, escolhe quem é e atualiza o próprio contador; o outro vê na hora.
Site estático (HTML + JS puro, sem build), gratuito de hospedar. **Não tem sala nem código.**

## Como usa
- Ao abrir pela primeira vez, toque no seu nome (PH ou Thivez). Fica salvo no aparelho.
- Já vem com duas caçadas: **Tepig (PH)** e **Snivy (Thivez)**. Dá para editar jogo/método
  e criar outras em **➕ Nova caçada**.
- Contador grande com **+1 / −1** (hordas somam +5). **✨ Achei o shiny!** confirma, solta confete e
  manda para o Histórico.
- **Shiny Dex**: os 156 de Unova (silhueta = falta, 🎯 = em caça, ⭐ = capturado), com filtro por pessoa.
- Chances da Gen 5: base 1/8192; Masuda 1/1365; Shiny Charm (só B2/W2) 1/2731; os dois 1/1024.
- Para trocar os nomes ou as caçadas iniciais, edite `PLAYERS` e `SEED` no começo de [app.js](app.js).

## Testar no PC (modo local)
```
py -m http.server 8099 --directory shiny-hunt
```
Abra http://localhost:8099. Sem o Firebase configurado, os dados ficam só no navegador (aviso amarelo).

## Ativar a sincronização entre vocês (Firebase, grátis)
1. https://console.firebase.google.com → **Adicionar projeto** (pode desativar o Analytics).
2. **Criar → Realtime Database → Criar banco de dados**.
3. Aba **Regras**, cole e publique:
   ```json
   {
     "rules": {
       "rooms": {
         "dupla": { ".read": true, ".write": true }
       }
     }
   }
   ```
   Só o caminho `rooms/dupla` é acessível; são apenas contadores, não guarde nada sensível.
4. **⚙️ Configurações do projeto → Seus apps → Web (`</>`)**, registre o app e copie o `firebaseConfig`.
5. Cole em [firebase-config.js](firebase-config.js), no lugar do `null`
   (`export const firebaseConfig = {...}`). Precisa ter o campo `databaseURL`.

## Colocar no ar (GitHub Pages)
1. Crie um repositório e envie o conteúdo da pasta `shiny-hunt`.
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. O link `https://SEU-USUARIO.github.io/NOME-DO-REPO/` é o mesmo para os dois.

## Arquivos
`index.html`, `styles.css`, `app.js` (interface e lógica), `store.js` (Firebase ou local),
`data.js` (Pokédex de Unova, da PokéAPI), `firebase-config.js` (sua configuração).
Sprites vêm do repositório público da PokéAPI no GitHub.

