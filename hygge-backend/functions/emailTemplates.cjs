const BRAND = {
  name: 'Hygge Games',
  green: '#008366',
  background: '#f3eee9',
  text: '#222222',
  muted: '#6e6e6e',
  white: '#ffffff',
  border: '#e2dcd6',
  shadow: '0 8px 32px 0 rgba(0,0,0,0.10)',
  radius: '20px',
  logoUrl: 'https://e-commerce-hygge.firebaseapp.com/src/img/logo.png',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function messageToHtml(message) {
  const safe = escapeHtml(message).replace(/\n/g, '<br/>');
  return `<p style="margin:0; font-family: Inter, Arial, sans-serif; font-size:16px; line-height:26px; color:${BRAND.text};">${safe}</p>`;
}

function safeHtmlBlock(html) {
  if (!html) return '';
  return String(html);
}

function generateEmailTemplate({
  title,
  message,
  buttonText,
  buttonLink,
  footerText,
  contentHtml,
} = {}) {
  const safeTitle = escapeHtml(title || '');
  const safeButtonText = escapeHtml(buttonText || '');
  const safeButtonLink = String(buttonLink ?? '');
  const safeFooterText = escapeHtml(footerText || `${BRAND.name} • Jogos para se conectar de verdade.`);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0; padding:0; background:${BRAND.background};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.background}; width:100%;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; background:${BRAND.white}; border-radius:${BRAND.radius}; box-shadow:${BRAND.shadow}; overflow:hidden;">
            <tr>
              <td style="background:${BRAND.green}; height:6px; line-height:6px; font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 24px 14px 24px;">
                <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="160" style="display:block; width:160px; max-width:160px; height:auto;" />
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px;">
                <div style="height:1px; background:${BRAND.border}; width:100%;"></div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 28px 10px 28px;">
                <h1 style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-weight:700; font-size:30px; line-height:36px; color:#111111; text-align:center; letter-spacing:0.01em;">
                  ${safeTitle}
                </h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 28px 18px 28px;">
                ${messageToHtml(message || '')}
                ${contentHtml ? `<div style="height:16px; line-height:16px;">&nbsp;</div>${safeHtmlBlock(contentHtml)}` : ''}
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:6px 28px 26px 28px;">
                <a href="${safeButtonLink}"
                   style="display:inline-block; background:${BRAND.green}; color:#ffffff; text-decoration:none; border-radius:24px; padding:12px 24px; font-family: Inter, Arial, sans-serif; font-weight:600; font-size:16px; line-height:20px; box-shadow:0 2px 12px 0 rgba(0,0,0,0.08);">
                  ${safeButtonText}
                </a>
                <div style="height:10px; line-height:10px;">&nbsp;</div>
                <div style="font-family: Inter, Arial, sans-serif; font-size:12px; line-height:18px; color:${BRAND.muted}; text-align:center;">
                  Se o botão não funcionar, copie e cole este link no navegador:<br/>
                  <span style="word-break:break-all;">${escapeHtml(safeButtonLink)}</span>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px;">
                <div style="height:1px; background:${BRAND.border}; width:100%;"></div>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 22px 24px; text-align:center; font-family: Inter, Arial, sans-serif; font-size:12px; line-height:18px; color:${BRAND.muted};">
                <div style="margin-bottom:6px;">${safeFooterText}</div>
                <div>© ${new Date().getFullYear()} ${BRAND.name}. Todos os direitos reservados.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { generateEmailTemplate };
