export function avisarFalha(doc: Document, err: unknown): void {
  console.error(err);
  const aviso = doc.getElementById('aviso-fontes');
  if (aviso) {
    aviso.textContent = 'Não foi possível carregar os dados agora. Tente novamente em instantes.';
    aviso.hidden = false;
  }
}
