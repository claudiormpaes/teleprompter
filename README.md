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
- **Ordem e busca (v9.7, 03/11/2026).** Pedido do Cláudio, porque o Felipe não achava os documentos:
  "force a organização do mais recente para o mais antigo".
  - Toda lista que o app monta (a do `drive.readonly`, a dos já trazidos pelo `drive.file`, a de cada
    conta) fica do mais recente para o mais antigo pela data de modificação do documento. O Drive já
    manda assim (`orderBy: 'modifiedTime desc'`) e o app ordena de novo (`GDocs.newestFirst`).
  - A janela do Google (Picker) **não tem opção de ordem**: a referência
    (https://developers.google.com/workspace/drive/picker/reference) não traz nenhum método de
    ordenação em `DocsView`, `PickerBuilder` ou `Feature`. A ordem lá dentro é a do Google.
  - Para o documento certo aparecer primeiro, há dois caminhos com métodos documentados. O que a
    pessoa escreve na busca do app vai para a janela já buscando (`View.setQuery`). O link do
    documento colado na busca abre a janela só nele (`setFileIds`, o mesmo do "Atualizar").
  - Dica na tela: arquivo do Word (.docx) não aparece, porque a janela só mostra Google Docs
    (`setMimeTypes`).
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
- O selo do REC vira "SEM SOM" e tem um medidor (até a v9.6 a faixa ficava logo acima da linha de leitura).
- **v9.0 (27/10, pedido do Cláudio): faixa grande o tempo todo** com a câmera ligada, letra de 34 a
  56 px e medidor largo: **SOM OK** (verde, contorno), **SOM BAIXO** (âmbar), **SEM SOM** (vermelho,
  pisca). "SOM OK" só depois de chegar som de verdade; antes disso, "OUVINDO…" (cinza).
- Microfone que cai fora da gravação (receptor tirado e posto de volta) é pedido de novo sozinho.
- **v9.7 (03/11, pedido do Cláudio): aviso menor.** "O alerta de som está muito grande e atrapalhando
  quem tem celular menor." A medição não mudou (limites, tempos e `Sound` iguais), só a apresentação.
  - **SOM OK e OUVINDO…** viram um selo pequeno (letra de 14 px, medidor de 3 px). Ele fica colado na
    imagem da câmera: ao lado dela, se a imagem está no alto, ou embaixo dela, se está no canto.
  - **SOM BAIXO e SEM SOM** continuam chamando a atenção (cor, SEM SOM piscando, causa escrita). O
    tamanho acompanha a largura e a altura da tela: `clamp(20px, min(7.2vw, 4.4vh), 34px)`, contra
    34 a 56 px na v9.6.
  - **Lugar, em pé (`SndSpot`).** O aviso nunca cobre o texto perto da linha de leitura (a linha, a
    de antes e a de depois, na coluna do texto), os controles à vista nem o selo REC. Com a linha
    embaixo (câmera da frente), fica logo acima do texto já lido. Com a linha no alto (traseira),
    fica no pé da tela, ou logo acima dos controles. Pode cobrir a imagem da câmera.
  - Sem espaço na largura (celular pequeno com os controles à vista), o aviso vai para a coluna da
    imagem, estreito. Sem espaço nem assim, fica só o título.
  - O lugar é refeito quando o estado do som muda, quando os controles aparecem ou somem, quando a
    gravação começa ou para e quando a tela gira.
  - Em pé com a imagem no canto, a linha de leitura agora para antes da imagem, e a coluna da
    imagem fica livre para o aviso.
  - Deitado, o lugar continua o do painel (frente) e o do canto (traseira). O selo REC "SEM SOM"
    esconde o próprio medidor para não ficar mais largo que a imagem.
  - Teste: `tests/test-som-tela.js`. Em pé: 320×568, 360×640, 360×740 e 384×832. Deitado: 640×360 e
    832×384. Frente e traseira, parado e gravando, nos quatro estados, com caixas sem sobreposição.

## Imagem em tela cheia e filtros de imagem (v10.0, 11/11/2026)

Pedido do Cláudio: "Vamos melhorar nosso app e deixar mais fácil o controle de qualidade da imagem.
Vamos deixar o vídeo em tela cheia. O roteiro, controles etc ficam com um fundo com transparência.
2. Vamos permitir colocar filtros leves de melhoria de rosto, imagem, etc."

**Tela cheia** (`camPos: 'full'`, classe `cam-full` no prompter e `tp-full` em `#app`):

- É o padrão novo nos quatro modos de gravação (frente e traseira, em pé e deitado). Quem já tinha
  configuração salva passa uma vez para a tela cheia, inclusive a memória de cada modo
  (`settings.camPosFullDone`). As posições antigas continuam em Ajustes > Onde fica a imagem (deitado:
  Tela cheia ou No canto).
- A imagem ocupa a tela toda, atrás de tudo (`object-fit: cover`), com o espelho de sempre (frontal
  espelhada na tela, arquivo sem espelho), de cabeça para baixo e deitado.
- Por cima, cada parte com fundo escuro semitransparente: barra do topo, painel, faixa atrás do texto
  (`#textband`, só a linha de leitura e uma linha antes e depois; o resto da imagem fica à vista), selo
  REC, faixa do som e avisos. A letra ganha sombra. Sem `backdrop-filter`/desfoque (esquenta): só rgba.
- Ajustes > **Transparência do fundo** (`settings.uiAlpha`, 20 a 90 %, padrão 55 %), lembrada.
- O texto já lido apaga por parágrafo (`Prompter.paintDone`, classe `done`): o degradê escuro do alto
  cobriria a imagem.
- Em pé o painel ficou mais baixo, para o texto da linha de leitura ficar livre até em tela de 568 px.
  O selo REC é posto pelo app (`SndSpot.badge`) no primeiro lugar livre, fora da linha e do texto em volta
  dela; o aviso (toast) da frente fica logo acima do texto da linha. Deitado, o selo fica no alto do
  painel (frente) ou da coluna do som (traseira). Em pé, o botão vermelho de parar do painel dá lugar à
  varinha e ao olho (parar: selo REC ou o botão do alto).
- **Ver imagem** (olho; em pé no painel, deitado na barra do topo): roteiro, faixas e avisos saem para
  conferir a imagem limpa; o texto pausa. Qualquer toque, pedal ou Esc traz tudo de volta e não inicia
  nem grava (`Peek`).
- Câmera desligada (imagem escondida, câmera ociosa, "Só ler"): fundo preto e avisos como antes.

**Filtros** (`Fx`, `FxUI`, `FxSheet`; `settings.fx`, por modo em `MODE_KEYS`):

- Varinha (em pé no painel, deitado na barra do topo): folha pequena por cima da imagem ao vivo, com o
  roteiro e os controles fora da frente. Os mesmos controles em Ajustes > Imagem.
- Prontos: Desligado (padrão), Natural, Suave, Quente. Réguas: Pele suave, Luz, Contraste, Cor e
  Temperatura, com faixas limitadas para ficar leve. "Antes": segurando, mostra a imagem sem filtro.
- Valem no arquivo. Um passe de shader WebGL (luz, contraste, saturação, temperatura e pele suave por
  desfoque que preserva bordas, só onde a cor é de pele, máscara em YCbCr) num canvas fora da tela; um
  canvas 2D copia o resultado. O 2D é o que fica na tela e o que a gravação captura
  (`captureStream(30)` + o som da câmera): o que se vê é o que vai para o arquivo. Só desenha quadro novo
  (`requestVideoFrameCallback`).
- **Desligado, ou tudo em zero, é o caminho de antes, exato:** a câmera direto no MediaRecorder, sem
  canvas, sem WebGL, sem laço extra.
- Com filtro, no máximo Full HD: a câmera é pedida em 1080 e o canvas nunca passa de 1920×1080. Com 4K
  escolhido, a folha avisa "Com filtro, o vídeo sai em Full HD."
- Gravando, o filtro não muda (a varinha some e Ajustes > Imagem trava com aviso).
- Segurança: WebGL que falha ou desenho que não acompanha a câmera (abaixo de ~20 quadros/s, perdendo
  quadros, por 3 s) desliga o filtro com aviso. Gravando, o canvas passa a copiar a imagem crua: a
  gravação segue no mesmo arquivo, sem corte. A câmera ociosa e sair do prompter param o laço.
- Giro no tkhd, nome dos arquivos, blocos, fim do roteiro gravando, medidor de som, pasta PROMPTER e
  envio ao Drive funcionam igual com filtro.
- Ficou de fora: a régua Luz usar a compensação de exposição da própria câmera
  (`exposureCompensation`); a câmera falsa dos testes não tem esse ajuste para testar.
- Testes: `tests/test-tela-cheia.js` e `tests/test-filtros.js`; `tests/test-som-tela.js` roda agora nas
  posições antigas e na tela cheia. Capturas em `../shots/v10/`.

## Fim do roteiro gravando (v9.8, 05/11/2026)

Pedido do Cláudio: "o aplicativo tem que continuar gravando no final. quando o roteiro encerra, ele
para a gravacao". Até a v9.7, quando o texto chegava ao fim rolando, o arquivo fechava sozinho 2,5 s
depois e cortava o final da fala.

- **No fim, a gravação continua.** O texto para no fim e o arquivo segue aberto até a pessoa parar.
  Aviso "Fim do roteiro · gravando"; a pílula diz "Pise para parar a gravação" (com pedal) ou "Toque
  para parar a gravação" (sem pedal), e o botão de play vira parar.
- **Iniciar para e salva.** No fim, gravando, o pedal da direita, o toque na tela e o play param e
  salvam (`Rec.finish`), em vez de recomeçar o texto do topo com a câmera gravando. Depois de parada,
  o próximo iniciar faz o de sempre: recomeça do topo num arquivo novo.
- **Voltar continua.** O pedal da esquerda (ou o botão de voltar) tira o texto do fim e a gravação
  segue no mesmo arquivo: dá para refazer o último trecho.
- As outras formas de parar não mudaram: selo REC, botão de parar do alto, botão vermelho do painel e
  sair do prompter (salva o que estiver gravando).
- **Esquecida gravando:** parada no fim, gravando, sem nenhum toque, tecla, pedal ou rolagem por
  10 minutos (`Rec.END_IDLE_MS`), a gravação para e salva sozinha, com um aviso. Qualquer interação
  passa por `Rec.poke`, que zera essa contagem. A câmera ociosa (`Rec.IDLE_MS`) não mudou: gravando,
  ela nunca desliga.
- Blocos (`# título`, um arquivo por bloco) e "Pausar no fim de cada parágrafo" continuam iguais: só
  o fim do último bloco (o fim do roteiro) mudou.
- Teste: `tests/test-fim-gravando.js` (o prazo de 10 min vira 3 s no teste).

## Gravar com o celular deitado (v9.6, 03/11/2026)

Pedido do Cláudio: usar o app também na posição de gravação horizontal. Na tela "Como vai gravar?"
há agora **Celular: Em pé | Deitado** no topo da caixa (fica lembrado em `settings.phone`). Com
"Deitado", os cartões da frente e da traseira abrem os modos `front-h` e `rear-h`, que têm memória
própria, separada dos modos em pé. "Só ler" não muda. Os modos em pé continuam iguais.

- **Tela:** `recScreen: 'landscape'` (novo chip "Deitada, o lado em que estiver"). Antes de gravar, a
  tela fica deitada no lado em que o celular estiver e o layout acompanha se ele for virado. Gravando,
  ela trava naquele lado (`landscape-primary` ou `landscape-secondary`).
- **Aviso "Deite o celular":** abrindo com o celular ainda em pé, o aviso aparece e some sozinho
  quando o acelerômetro mostra o celular deitado (gravidade no eixo x). Sem sensor, use o botão
  "Já está". O aviso de cabeça para baixo (`Flip`) nunca aparece nos modos deitados.
- **Câmera da frente deitada (`tp-lf` em `#app`):** a lente fica num dos lados curtos, na metade da
  altura. O lado sai de `screen.orientation.type`: `landscape-primary` = topo do aparelho à esquerda
  = lente à esquerda (`tp-lens-l`), `landscape-secondary` = lente à direita (`tp-lens-r`). O texto fica
  numa coluna encostada no lado da lente, com a linha de leitura a 45% da altura. No outro lado fica
  o painel: botões no alto, faixa do som e imagem no meio (a imagem na borda de fora, com o selo REC
  embaixo dela) e controles embaixo. O aviso (toast), a contagem, o selo "Pausado" e o retorno das
  ações também ficam no painel. Nada de controle ou aviso na faixa do lado da lente. Para caber, o
  botão de parar do painel e o de espelhar somem nesse layout: para parar, use o selo REC ou o botão do
  alto (o espelho continua nos Ajustes).
- **Câmera traseira deitada (`tp-lr`):** texto na largura toda, linha no terço, imagem no canto com a
  faixa do som logo abaixo dela e controles embaixo.
- **Arquivo horizontal:** com a tela deitada, o Chrome do Android entrega o quadro deitado e o vídeo
  sai com largura maior que altura, sem giro. Se mesmo assim a faixa vier em pé
  (`track.getSettings()` com largura menor que altura), `Rec.fixRot` grava o giro no tkhd (90° ou 270°,
  conforme o lado e a câmera) para o vídeo tocar horizontal.
- **Pedal:** o deslize continua medido no referencial do celular em pé, então os pedais não trocam
  de lugar nas duas orientações deitadas, e o deslize que começa sobre os controles continua valendo.
- Testes: `tests/test-horizontal.js` (telas 832×384 e 915×412, as duas orientações deitadas,
  sobreposição por caixas, ffprobe do arquivo, memória em pé/deitado e pedal).

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
(duas contas), `test-picker.js` (conta de fora no endereço público, com o Picker simulado), `test-som.js` (medidor de som com microfone simulado nos níveis medidos), `test-som-tela.js` (lugar e tamanho do aviso de som em telas pequenas) e `test-fim-gravando.js` (fim do roteiro gravando). Para rodar:
sirva o app em http://127.0.0.1:8765/ (`python -m http.server 8765 --bind 127.0.0.1`), depois
`cd ../tests && npm install puppeteer-core && node test.js`.
