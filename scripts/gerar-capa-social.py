"""Gera site/public/capa-social.png, a imagem que aparece quando um link do site é compartilhado.

Uso: python3 scripts/gerar-capa-social.py   (precisa do Pillow com suporte a WOFF2)

A imagem não traz números nem datas, para não ficar desatualizada. Usa as fontes e as cores de site/style.css.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
FONTES = RAIZ / 'site' / 'fontes'
LARGURA, ALTURA, MARGEM = 1200, 630, 72
FUNDO, TEXTO, SUAVE, AGENDA, ATO = '#fcfcfa', '#0e0e0e', '#57554f', '#0a6549', '#74298a'


def fonte(arquivo: str, tamanho: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTES / arquivo), tamanho)


def espacado(desenho: ImageDraw.ImageDraw, x: float, y: float, texto: str, f: ImageFont.FreeTypeFont, cor: str, espaco: float) -> float:
    for letra in texto:
        desenho.text((x, y), letra, font=f, fill=cor)
        x += desenho.textlength(letra, font=f) + espaco
    return x


imagem = Image.new('RGB', (LARGURA, ALTURA), FUNDO)
d = ImageDraw.Draw(imagem)
titulo, italico, rotulo = fonte('newsreader-500.woff2', 132), fonte('newsreader-400-italico.woff2', 44), fonte('public-sans-600.woff2', 24)

d.rectangle([MARGEM, 64, LARGURA - MARGEM, 69], fill=TEXTO)
d.text((MARGEM - 4, 104), 'Rastreador', font=titulo, fill=TEXTO)
d.text((MARGEM - 4, 104 + 128), 'do Presidente', font=titulo, fill=TEXTO)
d.text((MARGEM, 404), 'A agenda oficial e os atos do Presidente da República,', font=italico, fill=TEXTO)
d.text((MARGEM, 404 + 54), 'com a fonte pública de cada registro.', font=italico, fill=TEXTO)

d.rectangle([MARGEM, 540, LARGURA - MARGEM, 541], fill=TEXTO)
y = 564
d.ellipse([MARGEM, y + 3, MARGEM + 20, y + 23], fill=AGENDA)
x = espacado(d, MARGEM + 32, y, 'AGENDA', rotulo, SUAVE, 2.2) + 36
d.regular_polygon((x + 11, y + 13, 13), 4, rotation=45, fill=ATO)
x = espacado(d, x + 34, y, 'ATOS', rotulo, SUAVE, 2.2)
fim = 'RASTREADORDOPRESIDENTE.COM.BR'
largura_fim = sum(d.textlength(c, font=rotulo) + 2.2 for c in fim)
espacado(d, LARGURA - MARGEM - largura_fim, y, fim, rotulo, TEXTO, 2.2)

destino = RAIZ / 'site' / 'public' / 'capa-social.png'
imagem.save(destino, optimize=True)
print(destino.relative_to(RAIZ), destino.stat().st_size, 'bytes')
