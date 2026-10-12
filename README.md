# Rastreador do Presidente

**O que o Presidente da República fez e o que está na agenda oficial dele, com link para a fonte em cada item.**

🔗 **Site:** https://rastreadordopresidente.com.br/

Projeto independente, sem vínculo com o governo, partido ou veículo de imprensa. Não tem login, não coleta dados de
quem visita e não publica opinião: mostra o registro oficial e aponta de onde ele veio.

## O que você encontra no site

- **Linha do tempo** com os compromissos da agenda oficial e os atos publicados no Diário Oficial (decretos, leis e
  medidas provisórias), do mais recente para o mais antigo, desde 01/01/2023.
- **Filtros** por data, tipo e status. O endereço da página guarda o filtro, então dá para compartilhar.
- **Notícias** numa aba separada: o que a imprensa publicou, sem misturar com o registro oficial.
- **Fonte em tudo**: cada item tem link para o documento público de origem. Item sem fonte não entra.
- **[Sobre e metodologia](https://rastreadordopresidente.com.br/sobre.html)**: o que cada status
  significa e os limites do que o site consegue saber.

## De onde vêm os dados

| Fonte | O que traz |
|---|---|
| Agenda do Presidente (gov.br/planalto) | Compromissos publicados pelo governo |
| Diário Oficial da União (in.gov.br) | Decretos numerados, leis e medidas provisórias |
| Comunicados do Planalto | Avisos de pauta publicados pelo governo |
| Google Notícias e Agência Brasil | Títulos e links da imprensa (aba Notícias) |

Um robô consulta essas fontes a cada 10 minutos, guarda o resultado em arquivos JSON na pasta [`data/`](data/) e
republica o site. Tudo acontece aqui no repositório, à vista de todos: o código, os dados e o histórico de cada
alteração.

## Os princípios do projeto

1. **Na dúvida, omitir é melhor do que afirmar.** Um compromisso não vira "Realizado" só porque a data passou.
2. **Falhar com aviso é melhor do que mostrar dado errado em silêncio.** Se uma fonte muda ou cai, o site avisa.
3. **Nada de reescrever as fontes.** O texto mostrado é o texto oficial.
4. **Sem entrada de usuário, sem servidor, sem rastreamento.** É um site estático.

## Quer ajudar?

Toda ajuda é bem-vinda, e não precisa saber programar:

- **Achou um dado errado ou faltando?** [Avise por aqui](https://github.com/EduardoMilani8/rastreador-presidente/issues/new?template=1-erro-nos-dados.yml).
  É a contribuição mais valiosa para o projeto.
- **O site quebrou ou ficou difícil de usar?** [Conte o que aconteceu](https://github.com/EduardoMilani8/rastreador-presidente/issues/new?template=2-problema-no-site.yml).
- **Tem uma ideia?** [Sugira](https://github.com/EduardoMilani8/rastreador-presidente/issues/new?template=3-sugestao.yml).
- **Quer mexer no código?** Leia o [CONTRIBUTING.md](CONTRIBUTING.md): ele explica como rodar o projeto e o que um
  pull request precisa ter.

## Rodando na sua máquina

Precisa de [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
git clone https://github.com/EduardoMilani8/rastreador-presidente.git
cd rastreador-presidente
npm ci
npm run dev
```

O site abre em `http://localhost:5173`, lendo os dados da pasta `data/`. Para rodar os testes: `npm test`.

## Para saber mais

- [CONTRIBUTING.md](CONTRIBUTING.md): como contribuir.
- [docs/MANUTENCAO.md](docs/MANUTENCAO.md): publicação, e-mails de falha e troca de mandato.
- [docs/superpowers/specs](docs/superpowers/specs): o desenho original do projeto.

## Licença

O código é aberto sob a [licença MIT](LICENSE): pode usar, copiar e modificar, mantendo o aviso de autoria. Os dados em
`data/` vêm de fontes públicas oficiais e da imprensa, e cada item aponta para a sua origem.
