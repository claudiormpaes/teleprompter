# Teleprompter

Aplicativo web estatico (PWA) para ler roteiro na hora de gravar video. HTML, CSS e JavaScript
puros: sem framework, sem build, sem servidor. Depois da primeira abertura funciona offline.

Publicado em https://claudiormpaes.github.io/teleprompter/ (todos os caminhos internos sao
relativos, entao o app tambem roda em qualquer subpasta ou localmente). O app Android da Play
Store (pacote `br.com.claudiopaes.teleprompter`, pasta `../android`) e uma TWA que abre esse
mesmo endereco: publicar aqui atualiza o app instalado, sem gerar APK novo.

## Arquivos

- `index.html` estrutura e icones SVG embutidos
- `styles.css` tema "estudio": preto real, texto marfim, ambar de luz no ar
- `app.js` toda a logica (biblioteca, editor, prompter, pedal, voz, ajustes)
- `fonts/` Atkinson Hyperlegible Next (texto) e Space Grotesk (numeros e titulos), licenca OFL
- `sw.js` service worker, cache primeiro, versao em `const V`
- `manifest.webmanifest` inclui `share_target` (compartilhar texto de outro app vira roteiro)
- `privacidade.html` politica exigida pela Play Store

## O que mudou na v6 (outubro de 2026)

- Velocidade em **palavras por minuto** (a Robertha le entre 109 e 147). Mudar a fonte nao muda o
  ritmo de leitura. Cada roteiro lembra a propria velocidade. Mostra o tempo que falta.
- Controle de velocidade grande: regua para arrastar, mais e menos de 64 px que repetem quando
  segurados, e quatro velocidades prontas nos ajustes.
- O pedal da esquerda **volta ao comeco do paragrafo e pausa** (pisar de novo vai ao anterior);
  o da direita inicia e pausa. Paragrafos sao separados por linha em branco.
- Assistente "Configurar o pedal em 2 passos" e tela do pedal que diz em que modo ele esta.
- Linha de leitura ajustavel, texto ja lido escurecido, marcadores `# titulo`, `[indicacao]` e
  `**enfase**`, pausa automatica no fim de cada paragrafo (gravar por blocos).
- "Acompanhar a minha voz": rola so enquanto a pessoa fala, sem internet (energia do microfone).
- Durante a leitura os controles somem; pedal e voz nao os fazem aparecer (o vidro mostra so o
  texto). Tocar na tela pausa; tocar na faixa de baixo mostra os controles.
- Dedo arrastando rola o texto; barra de posicao com marcas de paragrafo.
- Apagar tem "Desfazer". Backup e restauracao em arquivo. Importar `.txt`/`.md`.

## Google Docs (v7)

Botao "Google Docs" na biblioteca: lista os documentos do Drive (mais recentes primeiro, com
busca pelo nome), traz o escolhido como roteiro e guarda o vinculo. Ao abrir um roteiro vinculado
para ler, o app confere se o documento mudou e oferece "Atualizar"; no editor ha o botao Atualizar.

- Login: OAuth implicito por redirecionamento (funciona no app instalado), cliente
  `teleprompter-docs` do projeto GCP `dashboard-de-mercado` (Google Auth Platform > Clientes).
  O app OAuth do projeto e INTERNO na organizacao claudiopaes.com.br (aparece como "Robertha
  Dutra CRM"): so `claudio@claudiopaes.com.br` autoriza. Escopo `drive.readonly`.
- Origens autorizadas: `https://claudiormpaes.github.io` e `http://localhost:8765`. Redirecionamento:
  `https://claudiormpaes.github.io/teleprompter/` e `http://localhost:8765/`. Outro endereco
  exige cadastrar no cliente.
- Token de 1 h guardado no aparelho; vencido, o app reconecta sozinho (`prompt=none` com a conta
  conhecida) e so pede a conta se isso falhar.
- Texto: exporta o Doc em markdown (titulos viram marcador `#`, negrito vira `**`, italico e links
  viram texto, lista vira `•`, escapes `\` somem). Se o markdown falhar, cai para texto puro.
- API do Drive ligada no projeto em 06/10/2026.

### Mais de uma conta (v8.9, 27/10/2026)

Pílulas no alto da lista do Docs, uma por conta, e "+ Conta". A lista mostra uma conta por vez; cada
roteiro anota a conta de onde veio (`source.acct`) e o "Atualizar" lê por ela. Roteiro antigo, sem
conta anotada, lê pela principal.

- **Conta principal** = a primeira conectada (`tp.gemail`, `tp.gtoken`). Os vídeos gravados sobem
  para o Drive dela. As outras ficam em `tp.gaccts` e só leem (`drive.readonly`). Desconectar a
  principal promove a próxima e zera as pastas do envio (`tp.upRoot`, `tp.upDays`). Sem nenhuma
  conta, o envio ao Drive entra pelo cliente `ext`.
- **Dois clientes OAuth**, escolhidos por conta (`client` no registro da conta):
  - `int`: `teleprompter-docs`, projeto `dashboard-de-mercado`, app INTERNO. Para contas
    `@claudiopaes.com.br`. Sem aviso e sem prazo.
  - `ext`: `teleprompter-contas` (`281907382405-fc49…`), projeto `teleprompter-contas`, app
    EXTERNO **em produção desde 29/10/2026**, nome "Teleprompter": entra qualquer conta Google.
    Pede só `drive.file` (escopo não confidencial: sem verificação nem auditoria). A marca não
    foi verificada, então a tela do Google mostra o endereço do site em vez do nome.
  - Mesmas origens e redirecionamentos nos dois clientes.
- **Conta `ext` só com `drive.file` (v9.1):** não lista o Drive. O botão "Escolher no Google
  Drive" abre o Google Picker (`apis.google.com/js/api.js`, chave `PICKER_KEY` só da Picker API,
  presa a github.io, docs.google.com e localhost/127.0.0.1:8765; `PICKER_APP` = número do projeto).
  O documento escolhido fica liberado para o app; a lista mostra os que já vieram. Na primeira
  entrada a janela abre sozinha. "Atualizar" de documento não liberado (trazido no tempo do
  `drive.readonly`) oferece "Escolher", com a janela já nele (`setFileIds`). Conta `ext` cujo
  token ainda traz `drive.readonly` (login do modo de teste) continua com a lista completa.
- No endereço público, a tela de entrar mostra só "Entrar com o Google". O botão da conta
  `@claudiopaes.com.br` aparece em localhost/127.0.0.1 ou com uma conta do domínio já conectada.
- O app interno do `dashboard-de-mercado` NÃO pode virar externo: a agenda do CRM usa ele e, em
  modo de teste, o refresh token dela venceria em 7 dias.

## Gravação: medidor de som (v8.9, 27/10/2026)

Em 27/10, 5 de 9 vídeos saíram mudos: o receptor USB do Hollyland ficou ligado e entregou só um
chiado digital, sem nenhum erro no Android. O app agora ouve a faixa de áudio que vai para o
arquivo, 10 vezes por segundo, desde que a câmera liga:

- **Sem som** (vermelho, vibra se estiver gravando): pico abaixo de -70 dBFS por 2 s, faixa de
  áudio ausente, encerrada ou muda (outro app pegou o microfone). Medido nos arquivos: os mudos
  ficam entre -83 e -80 dBFS; com o Hollyland funcionando o pico nunca desceu de -54 dBFS, nem nas
  pausas da fala.
- **Som muito baixo** (âmbar): gravando com o texto rolando e nada acima de -45 dBFS por 12 s.
- A faixa aparece logo acima da linha de leitura; o selo do REC vira "SEM SOM" e tem um medidor.
- **v9.0 (27/10, pedido do Cláudio): faixa grande o tempo todo** com a câmera ligada, letra de 34 a
  56 px e medidor largo: **SOM OK** (verde, contorno), **SOM BAIXO** (âmbar), **SEM SOM** (vermelho,
  pisca). "SOM OK" só depois de chegar som de verdade; antes disso, "OUVINDO…" (cinza).
- Microfone que cai fora da gravação (receptor tirado e posto de volta) é pedido de novo sozinho.

## Pedal Bluetooth (M-VAVE Cube Turner)

O Cube Turner tem 7 modos (toque curto no botao Mode; o LED mostra qual):

| Modo | Envia | No app |
|---|---|---|
| 1 | setas esquerda/direita | funciona |
| 2 | setas cima/baixo | funciona |
| 3 | Page Up / Page Down | **recomendado** |
| 4 | Espaco / Enter | funciona |
| 5 | teclas de midia | evitar: o celular pode abrir o player |
| 6 | deslize esquerda/direita (toque simulado) | funciona |
| 7 | deslize cima/baixo (toque simulado) | funciona |

Segurar o botao Mode liga o envio continuo (ultimo LED): deixe desligado. O pedal dorme depois de
uns 25 minutos parado e a primeira pisada so o acorda.

Em 06/10/2026 o pedal da Robertha estava no modo 6. Medido no S25 FE com `adb shell getevent`:
o Android ve tres dispositivos (`CubeTurner Keyboard`, `CubeTurner Consumer Control` e
`CubeTurner`, uma tela de toque externa com `OrientationAware: true`). Cada pisada desenha um
deslize de x=150 a x=1100 (escala 0..1200), com y parado no meio da tela, em 175 a 195 ms.

Como o app trata isso:

- **Pedal x dedo.** O deslize do pedal e uma linha perfeitamente reta; dedo nunca e. Linha reta
  de 40 px ou mais vira comando; arrasto torto rola o texto. Sobre um controle (regua, botoes,
  barra de posicao) so vale como pedal o deslize reto e longo (160 px, ou 70% do tamanho aprendido
  no assistente), e o que o controle tiver feito no caminho e desfeito.
- **Sem regra de tempo.** Celular ocupado atrasa eventos; so a geometria decide.
- **Rotacao.** O pedal desenha no referencial fisico da tela. O app converte o deslize para o
  referencial do celular em pe (`screen.orientation.angle`), entao girar o aparelho nao troca os
  pedais de lugar.
- **Comando duplo.** A mesma acao vinda de qualquer fonte dentro de uma janela curta e ignorada
  (iniciar/pausar: 320 ms).
- **Foco.** O teclado e ouvido na fase de captura; com a leitura aberta, foco em botao ou em
  checkbox escondido nao rouba a tecla do pedal (antes, Espaco podia ligar o espelho).
- **Gesto de voltar do navegador.** Deslize horizontal fora da leitura fazia o Chrome voltar a
  pagina (no app instalado, fechava). Agora e bloqueado em todas as telas.

## Comando de voz

O botao de microfone liga o reconhecimento de voz do navegador (pt-BR, exige internet). Comandos,
falados sozinhos: iniciar, pausar, mais rapido, mais devagar, voltar, recomecar. No Chrome do
Android a sessao cai sozinha e o app religa (0,35 s; 2 s se cair em menos de 1 s). Pode dar bipe
ao religar: para gravar, prefira o pedal. Comando de voz e "acompanhar a voz" nao ligam juntos.

## Atualizar a versao publicada

O service worker serve do cache. Ao alterar qualquer arquivo, suba `const V` em `sw.js`
(`v6`, `v7`...). O app avisa "Versao nova pronta" fora da tela de leitura.

## Teste local

    python -m http.server 8080

Depois abra http://localhost:8080/.

Testes de ponta a ponta em `../tests/` (Chrome emulando o S25 FE): `test.js` (39 verificacoes:
teclas, deslize reto e torto, rotacao, regua, ajustes, assistente), `test-fluxos.js` (compartilhar,
importar, desfazer, backup) e `test-voz.js` (comando de voz nao dispara lendo o roteiro) e `test-docs.js` (Google Docs com a API
simulada: login, lista, busca, importacao, aviso de mudanca, token vencido), `test-contas.js`
(duas contas), `test-picker.js` (conta de fora no endereço público, com o Picker simulado) e `test-som.js` (medidor de som com microfone simulado nos níveis medidos). Para rodar:
sirva o app em http://127.0.0.1:8765/ (`python -m http.server 8765 --bind 127.0.0.1`), depois
`cd ../tests && npm install puppeteer-core && node test.js`.
