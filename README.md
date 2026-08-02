# Teleprompter

Aplicativo web estatico (PWA) para ler roteiro na hora de gravar video. HTML, CSS e JavaScript
puros: sem framework, sem build, sem servidor. Depois da primeira abertura funciona offline.

Publicado em https://claudiormpaes.github.io/teleprompter/ (todos os caminhos internos sao
relativos, entao o app tambem roda em qualquer subpasta ou localmente).

## Arquivos

- `index.html` estrutura e icones SVG embutidos
- `styles.css` tema escuro
- `app.js` toda a logica (biblioteca, editor, prompter, pedal, voz)
- `sw.js` service worker, cache primeiro, versao em `const V`
- `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`

## Como usar

1. Abra o endereco no Chrome do celular e escolha "Instalar aplicativo" ou "Adicionar a tela
   inicial". Instalado, ele abre em tela cheia e sem barra do navegador.
2. Na tela inicial, crie um roteiro. O editor salva sozinho enquanto voce digita.
3. Toque em Apresentar. Depois da contagem regressiva o texto comeca a rolar.
4. Toque em qualquer ponto da tela para pausar e retomar. A rolagem desacelera e acelera de
   forma suave, sem solavanco. Deslizar o dedo nao conta como toque: e comando de pedal.
5. Na engrenagem ficam velocidade, tamanho da fonte, altura de linha, margem lateral, cor do
   texto, guia de leitura, contagem regressiva e os dois espelhamentos.

Para o teleprompter fisico com vidro (Parrot), ligue "Espelhar na horizontal". Se o suporte
inverter a imagem de cima para baixo, ligue tambem o espelhamento vertical.

Os roteiros e os ajustes ficam no armazenamento local do navegador, so neste aparelho. Limpar os
dados do site apaga tudo.

## Pedal Bluetooth

O M-VAVE Cube Turner se apresenta como teclado Bluetooth e muda de comportamento conforme o modo.
Em uns ele manda tecla; em outros trabalha em modo de toque, simulando rolagem ou deslize na tela,
sem enviar tecla nenhuma. O aplicativo entende os tres casos, e o mapeamento padrao cobre todos:

Modo de tecla

- PageDown, seta para baixo, seta para a direita, espaco, enter: inicia e pausa
- PageUp, seta para cima, seta para a esquerda: volta um trecho
- Home: volta ao inicio
- Tecla de mais e de menos: velocidade

Modo de toque

- deslize para baixo ou para a esquerda, rolagem para baixo ou para a esquerda: inicia e pausa
- deslize para cima ou para a direita, rolagem para cima ou para a direita: volta um trecho

Um toque simples na tela, sem deslocamento, continua sendo iniciar e pausar. So conta como
deslize um movimento de 40 px ou mais; abaixo disso o app trata como toque. Comandos de rolagem
tem intervalo minimo de 0,35 s entre si, para uma unica pisada nao virar varios comandos.

Se o seu pedal enviar outra coisa, abra a tela Pedal (icone na tela inicial). O monitor ao vivo
mostra as ultimas dez entradas recebidas: teclas com `key`, `code`, `keyCode` e autorrepeticao;
rolagem com `deltaY` e `deltaX`; deslizes com direcao e distancia. Logo abaixo, cada acao tem o
botao "Definir comando": toque nele e acione o pedal, seja tecla ou gesto, para gravar. Uma acao
aceita varios comandos. O botao "Restaurar padrao" volta ao mapeamento de fabrica.

Detalhe de comportamento: manter o pedal pressionado repete a tecla. Acoes de pulso (avancar,
voltar, mais rapido, mais devagar) aceitam essa repeticao; iniciar e pausar ignora, para nao
piscar entre os dois estados.

Se o monitor nao registrar nada, confira o pareamento no Bluetooth do Android e toque uma vez na
tela para garantir o foco no aplicativo.

## Comando de voz

O botao de microfone no prompter liga o reconhecimento de voz do navegador (pt-BR). Exige
internet e permissao de microfone; o audio vai para o servico de reconhecimento do proprio
navegador. Onde a API nao existe, o botao fica desativado e o resto continua funcionando.

Comandos: iniciar, comecar, vai, segue, play, pausar, parar, pera, mais rapido, acelera, mais
devagar, devagar, voltar, do inicio, recomecar.

Para o texto do roteiro nao virar comando sem querer, so entram resultados finais e frases
curtas, de ate quatro palavras, ditas isoladamente.

No Chrome do Android a sessao de reconhecimento morre sozinha com frequencia, com erro `aborted`
ou `no-speech`, as vezes em poucos segundos. Enquanto o microfone estiver ligado e o prompter
aberto, o app religa sozinho: 0,35 s depois da queda, ou 2 s se a sessao anterior tambem tiver
durado menos de 1 s, para nao entrar em laco. So a negativa de permissao encerra de vez, e ai o
aviso na tela muda para "Voz bloqueada".

## Comportamento como aplicativo instalado

Instalado na tela inicial, o app ja abre em tela cheia. Nesse modo o Android recusa o pedido
explicito de tela cheia, e o app nem pede: detecta o `display-mode` e segue em frente. O mesmo
vale para manter a tela acesa, que depende de permissao e de bateria. Nenhum desses recursos e
pre requisito: se falharem, rolagem, contagem regressiva, pedal e voz continuam funcionando.

## Atualizar a versao publicada

O service worker serve do cache. Ao alterar qualquer arquivo, mude `const V = 'v1'` em `sw.js`
para `v2`, `v3` e assim por diante. Sem isso o aparelho continua exibindo a versao antiga.

## Teste local

    cd app
    python3 -m http.server 8080

Depois abra http://localhost:8080/. O service worker exige origem segura: localhost serve, e em
producao o GitHub Pages ja entrega em https.
