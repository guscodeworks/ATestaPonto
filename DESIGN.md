---
name: ATestaPonto
description: Controle de presença escolar com login, QR Code e geolocalização.
colors:
  azul-atesta: "#1450F0"
  azul-atesta-hover: "#0040CC"
  vermelho-sinal: "#F01414"
  tinta-escolar: "#141414"
  papel: "#F8F9FC"
  superficie: "#FFFFFF"
  texto-apagado: "#6B7280"
  texto-apagado-admin: "#7181A1"
  borda-admin: "#E4E9F3"
  sucesso: "#0C7C4E"
  sucesso-fundo: "#ECFBF4"
  aviso: "#D97706"
  aviso-fundo: "#FFFBEB"
  perigo: "#B91C1C"
  perigo-fundo: "#FFF5F5"
  info: "#1251A3"
  info-fundo: "#EEF5FF"
typography:
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "31px"
    fontWeight: 700
    lineHeight: 1.12
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  btn: "6px"
  card: "10px"
  lg: "16px"
  xl: "22px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "14px"
  md: "20px"
  lg: "24px"
components:
  button:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.azul-atesta}"
    typography: "{typography.control}"
    rounded: "{rounded.btn}"
    padding: "8px 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.azul-atesta}"
    textColor: "{colors.papel}"
    typography: "{typography.control}"
    rounded: "{rounded.btn}"
    padding: "8px 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta-escolar}"
    rounded: "{rounded.btn}"
    padding: "8px 14px"
  button-login:
    backgroundColor: "{colors.tinta-escolar}"
    textColor: "{colors.superficie}"
    rounded: "8px"
    padding: "0 20px"
    height: "52px"
    width: "100%"
  input:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta-escolar}"
    rounded: "{rounded.card}"
    padding: "10px 14px 10px 44px"
    height: "44px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge-active:
    textColor: "{colors.azul-atesta}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  badge-absent:
    textColor: "{colors.vermelho-sinal}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  nav-link-active:
    textColor: "{colors.azul-atesta}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
    height: "48px"
---

# Design System: ATestaPonto

## Overview

**Creative North Star: "A Sala de Aula Organizada"**

O ATestaPonto tem a clareza calma de um painel escolar bem arrumado: fundo papel quase branco, superfícies brancas, texto em tinta escura e uma única cor de ação, o Azul Atesta. A organização vem da contenção. Controles finos, sombras leves e hierarquia tipográfica feita só com Inter deixam cada tela legível para quem bate o ponto com pressa ou revisa um relatório no fim do dia.

O calor humano da escola aparece nas formas orgânicas: manchas azuis e vermelhas, recortadas com raios assimétricos, encostam nos cantos da sidebar, do item ativo de navegação e dos cartões de indicadores. São a assinatura da marca e ficam sempre na borda, atrás do conteúdo, sem disputar com a informação.

Todas as cores derivam da logo. Tons intermediários de texto, borda e fundo são misturas (`color-mix`) do Azul Atesta, do Vermelho Sinal e da Tinta Escolar com o papel, em vez de matizes novos.

**Key Characteristics:**
- Paleta de três cores da logo sobre papel claro, com tons derivados por mistura.
- Uma família tipográfica (Inter), com hierarquia feita por peso e tamanho.
- Controles contidos: bordas de 1px, raios de 6 a 10px, sombras quase imperceptíveis.
- Formas orgânicas azul e vermelha como assinatura, sempre nos cantos.
- Densidade de painel no admin; alvos maiores e cartões mais arredondados na área do funcionário.

## Colors

Três cores da logo fazem todo o trabalho; as cores semânticas existem só para estados.

### Primary
- **Azul Atesta** (`azul-atesta`): ação principal, link, item de navegação ativo, foco, badges de status positivo e a mancha orgânica dominante. O hover escurece para **Azul Atesta Profundo** (`azul-atesta-hover`) ou mistura 92% azul com tinta.

### Secondary
- **Vermelho Sinal** (`vermelho-sinal`): ausência, falta e alerta, além da mancha orgânica secundária (canto do item ativo, sidebar, ponto de destaque do funcionário). Nunca é cor de ação.

### Neutral
- **Tinta Escolar** (`tinta-escolar`): texto principal e o botão Entrar do login. As variantes de texto 700/500/300 são misturas de 82%, 62% e 42% com o papel.
- **Papel** (`papel`): fundo de página e texto sobre o azul.
- **Superfície** (`superficie`): cards, campos, sidebar e botões padrão.
- **Borda Admin** (`borda-admin`): divisórias e contornos da área administrativa. As bordas genéricas são tinta a 10%, 18% e 30% sobre o papel.
- **Texto Apagado** (`texto-apagado`, `texto-apagado-admin`): subtítulos, e-mails em tabelas e metadados.

### Semânticas
Sucesso, aviso, perigo e info têm cada um uma cor de texto e um fundo claro (`*-fundo`), usados em alertas e mensagens de estado.

### Named Rules
**The Logo Palette Rule.** Nenhum matiz novo entra no sistema. Tons intermediários são `color-mix` das três cores da logo com o papel ou a superfície.

**The Red Is a Signal Rule.** O vermelho marca ausência, erro ou a assinatura orgânica. Botões de ação e links nunca são vermelhos.

## Typography

**Body Font:** Inter (com `sans-serif`)
**Label/Mono Font:** Inter também no admin (`--font-mono` redefinido para Inter); Consolas só aparece como fallback legado.

**Character:** Uma sans neutra e muito legível, que deixa o sistema com cara de ferramenta institucional e não de peça de marketing.

### Hierarchy
- **Headline** (700, 31px, 1.12): título de página no admin, com subtítulo em Texto Apagado Admin a 15px.
- **Title** (700, 15px): títulos de card e seção.
- **Body** (400, 15px, 1.55): texto corrido e células de tabela (13 a 14px nas tabelas densas).
- **Control** (600, 14px, 1.2): botões e itens de navegação (500 na navegação); 13px em `btn-sm`, 15px em `btn-lg`.
- **Label** (700, 12px, 0.06em, maiúsculas): rótulos de campos e seções. Badges usam 600, 12px e 0.02em, sem maiúsculas.

### Named Rules
**The One Family Rule.** Toda a hierarquia sai de Inter, variando peso e tamanho. A página de erro ainda usa Nunito; isso é uma divergência a corrigir, não um precedente.

## Layout

O admin é um app shell com sidebar fixa à esquerda (`clamp(300px, 19.5vw, 340px)`) e topbar de 88px, com conteúdo em grades de cards: o dashboard usa duas colunas (`2fr` + `minmax(280px, 1fr)`) com 20px de gap, e os formulários usam uma coluna principal com uma lateral de 260 a 300px e 24px de gap. Cards têm 24px de padding interno e cabeçalhos com 16px por 24px.

Os pontos de quebra observados são 1280, 1100, 980, 900, 768 e 480px. Abaixo de 980px, formulários e grades viram uma coluna. Abaixo de 768px, a sidebar sai do fluxo. A área do funcionário é mobile-first, com cartões arredondados a 16px e fundos ilustrados separados para celular e desktop.

## Elevation & Depth

Sistema híbrido e discreto. As superfícies se separam do papel principalmente por borda de 1px, e a sombra só confirma a camada. As sombras do admin usam tinta neutra em opacidades baixas. As da marca usam azul ou um azul-acinzentado frio, nunca preto puro.

### Shadow Vocabulary
- **Card em repouso** (`box-shadow: 0 1px 3px rgba(20,20,20,0.08), 0 1px 2px rgba(20,20,20,0.04)`): cards padrão do admin.
- **Painel admin** (`box-shadow: 0 8px 24px rgba(32, 57, 104, 0.06)`): painéis e cartões elevados da identidade visual.
- **Card da marca** (`box-shadow: 0 2px 8px rgba(20, 80, 240, 0.08)`), com hover em `0 6px 16px rgba(20, 80, 240, 0.14)`: hover de painéis e cards de destaque.
- **Item ativo** (`box-shadow: 0 7px 18px rgba(20, 80, 240, 0.06)`): item ativo da navegação lateral.
- **Campo** (`box-shadow: 0 1px 2px rgba(20, 20, 20, 0.03)`): profundidade mínima de inputs.

### Named Rules
**The Border First Rule.** A borda separa, a sombra apenas confirma. Nenhuma superfície depende só da sombra para existir.

## Shapes

Os controles são suavemente arredondados (botões a 6px, campos e itens de navegação a 10px), e os cards são mais generosos (16px no admin e nos cartões móveis do funcionário, 22px nos maiores). Badges e pontos de status são pílulas completas.

A assinatura geométrica são as manchas orgânicas: formas com `border-radius` assimétrico em oito valores (como `34% 0 52% 62% / 42% 0 58% 48%`), levemente rotacionadas, sangrando para fora dos cantos com `overflow: hidden` no contêiner.

## Components

### Buttons
Contidos e precisos: o sistema tem um único botão cheio por contexto.
- **Shape:** suavemente arredondado (6px), altura mínima de 36px.
- **Padrão:** superfície branca, borda de tinta a 10%, texto Azul Atesta, 600 a 14px, ícone de 18px com 8px de gap.
- **Primário:** fundo e borda Azul Atesta, texto papel, ícones invertidos para branco.
- **Hover / Focus:** o padrão ganha um véu de 7% de azul. O primário mistura 92% azul com tinta. O foco é um contorno de 2px de azul a 55%, afastado 2px. Desabilitado fica com 58% de opacidade.
- **Secundário / Ghost:** texto em tinta a 76% ou 66%, borda de tinta a 14% ou 10%; o hover escurece a borda e o texto. Tamanhos `sm` (30px) e `lg` (40px).
- **Entrar (login):** bloco de largura total, 52px de altura e raio de 8px, em Tinta Escolar com texto branco.

### Chips / Badges
- **Style:** pílula com 3px por 10px de padding, 600 a 12px e um ponto de 5px na cor do texto.
- **State:** ativo e info usam azul a 8% sobre a superfície, com borda azul a 18%. Ausência usa vermelho a 8% com borda a 20%. Atraso usa tinta a 6%. Inativo usa papel com texto 300.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** superfície branca sobre papel.
- **Shadow Strategy:** card em repouso; o hover da marca só em painéis interativos.
- **Border:** 1px em `--border-light` (tinta a 10%).
- **Internal Padding:** 24px; cabeçalho de 16px por 24px com divisória inferior.

### Inputs / Fields
- **Style:** 44px de altura, superfície branca, borda de tinta a 10%, raio de 10px e ícone à esquerda em tinta a 48% (padding esquerdo de 44px, ou 14px sem ícone).
- **Focus:** borda Azul Atesta e anel de 3px de azul a 14%. O hover escurece a borda para 18%.
- **Labels:** rótulo em caixa alta, 700 a 12px, com 0.06em de espaçamento.

### Navigation
- **Style:** sidebar branca com borda direita Borda Admin e sombra lateral fria. Itens de 48px de altura, raio de 10px, ícone de 18px e texto 500 a 14px em tinta a 82%.
- **Hover:** véu de azul a 7%.
- **Active:** fundo azul a 6%, filete esquerdo de 3px Azul Atesta, texto azul, bordas em gradação azul para vermelho e uma pequena mancha Vermelho Sinal no canto inferior direito.
- **Mobile:** abaixo de 768px, a sidebar deixa o fluxo do layout.

### Mancha orgânica (signature)
Forma decorativa absoluta (`::before`/`::after`, `z-index: -1`, `pointer-events: none`) em Azul Atesta ou Vermelho Sinal, com raio assimétrico, leve rotação e sombra interna sutil. Aparece no topo da sidebar, no item ativo e no rodapé dos cartões de indicadores.

## Do's and Don'ts

### Do:
- **Do** derivar todo tom intermediário de `--color-primary`, `--color-accent` e `--color-text` com `color-mix` sobre papel ou superfície.
- **Do** manter um único botão primário Azul Atesta por grupo de ações; as demais ações usam o botão padrão, o secundário ou o ghost.
- **Do** separar superfícies com borda de 1px (tinta a 10% ou Borda Admin) antes de recorrer à sombra.
- **Do** usar o anel de foco do sistema: contorno de 2px de azul a 55% nos botões e anel de 3px de azul a 14% nos campos.
- **Do** colocar as manchas orgânicas nos cantos, atrás do conteúdo e com `pointer-events: none`.

### Don't:
- **Don't** introduzir matizes fora da logo (azul, vermelho e tinta) além das cores semânticas de estado.
- **Don't** usar Vermelho Sinal em botões de ação ou links; ele é reservado a ausência, erro e assinatura.
- **Don't** usar outra família tipográfica além de Inter em telas novas.
- **Don't** usar sombras em preto puro ou pesadas; o vocabulário de sombras acima é o limite.
- **Don't** deixar uma mancha orgânica sobrepor texto, campos ou alvos de toque.
