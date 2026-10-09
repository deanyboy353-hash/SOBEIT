#include "render.h"

#include <windows.h>
#include <cstring>

#define FVF_TEX (D3DFVF_XYZRHW | D3DFVF_DIFFUSE | D3DFVF_TEX1)
#define FVF_COL (D3DFVF_XYZRHW | D3DFVF_DIFFUSE)

bool Renderer::init(IDirect3DDevice9 *dev, const char *face, int height_px, bool bold)
{
	m_dev = dev;

	HDC dc = CreateCompatibleDC(nullptr);
	if (!dc) return false;

	BITMAPINFO bmi = {};
	bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
	bmi.bmiHeader.biWidth = m_tex_w;
	bmi.bmiHeader.biHeight = -m_tex_h;  // top-down
	bmi.bmiHeader.biPlanes = 1;
	bmi.bmiHeader.biBitCount = 32;
	bmi.bmiHeader.biCompression = BI_RGB;

	uint32_t *bits = nullptr;
	HBITMAP bmp = CreateDIBSection(dc, &bmi, DIB_RGB_COLORS, reinterpret_cast<void **>(&bits), nullptr, 0);
	HFONT font = CreateFontA(-height_px, 0, 0, 0, bold ? FW_BOLD : FW_NORMAL, FALSE, FALSE, FALSE,
	                         ANSI_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY,
	                         VARIABLE_PITCH, face);
	if (!bmp || !font)
	{
		if (bmp) DeleteObject(bmp);
		if (font) DeleteObject(font);
		DeleteDC(dc);
		return false;
	}

	HGDIOBJ old_bmp = SelectObject(dc, bmp);
	HGDIOBJ old_font = SelectObject(dc, font);
	SetTextColor(dc, RGB(255, 255, 255));
	SetBkColor(dc, RGB(0, 0, 0));
	SetBkMode(dc, OPAQUE);
	SetTextAlign(dc, TA_TOP);
	memset(bits, 0, m_tex_w * m_tex_h * 4);

	TEXTMETRICA tm;
	GetTextMetricsA(dc, &tm);
	m_line_h = tm.tmHeight;

	int x = 1, y = 1;
	for (int ch = 32; ch < 127; ch++)
	{
		char s[2] = { (char)ch, 0 };
		SIZE sz;
		GetTextExtentPoint32A(dc, s, 1, &sz);
		if (x + sz.cx + 1 >= m_tex_w)
		{
			x = 1;
			y += m_line_h + 1;
		}
		ExtTextOutA(dc, x, y, ETO_OPAQUE, nullptr, s, 1, nullptr);
		m_cw[ch] = sz.cx;
		m_u0[ch] = (float)x / m_tex_w;
		m_v0[ch] = (float)y / m_tex_h;
		m_u1[ch] = (float)(x + sz.cx) / m_tex_w;
		m_v1[ch] = (float)(y + m_line_h) / m_tex_h;
		x += sz.cx + 2;
	}

	bool ok = false;
	if (SUCCEEDED(m_dev->CreateTexture(m_tex_w, m_tex_h, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &m_tex, nullptr)))
	{
		D3DLOCKED_RECT lr;
		if (SUCCEEDED(m_tex->LockRect(0, &lr, nullptr, 0)))
		{
			for (int row = 0; row < m_tex_h; row++)
			{
				uint32_t *dst = reinterpret_cast<uint32_t *>(static_cast<uint8_t *>(lr.pBits) + row * lr.Pitch);
				const uint32_t *src = bits + row * m_tex_w;
				for (int col = 0; col < m_tex_w; col++)
				{
					uint32_t a = src[col] & 0xFF;  // white-on-black, any channel is coverage
					dst[col] = (a << 24) | 0x00FFFFFF;
				}
			}
			m_tex->UnlockRect(0);
			ok = true;
		}
	}

	SelectObject(dc, old_font);
	SelectObject(dc, old_bmp);
	DeleteObject(font);
	DeleteObject(bmp);
	DeleteDC(dc);

	if (!ok) shutdown();
	return ok;
}

void Renderer::shutdown()
{
	on_lost();
	if (m_tex) { m_tex->Release(); m_tex = nullptr; }
	m_dev = nullptr;
}

void Renderer::on_lost()
{
	if (m_state) { m_state->Release(); m_state = nullptr; }
}

void Renderer::on_reset() {}

bool Renderer::begin()
{
	if (!m_dev || !m_tex || m_in_frame) return false;

	if (!m_state && FAILED(m_dev->CreateStateBlock(D3DSBT_ALL, &m_state)))
		return false;
	if (FAILED(m_dev->GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO, &m_bb)))
		return false;

	D3DSURFACE_DESC desc;
	m_bb->GetDesc(&desc);
	m_screen_w = (float)desc.Width;
	m_screen_h = (float)desc.Height;

	m_state->Capture();
	m_dev->GetRenderTarget(0, &m_old_rt);
	m_dev->SetRenderTarget(0, m_bb);

	if (FAILED(m_dev->BeginScene()))
	{
		end();
		return false;
	}
	m_in_frame = true;
	setup_state();
	return true;
}

void Renderer::setup_state()
{
	D3DVIEWPORT9 vp = { 0, 0, (DWORD)m_screen_w, (DWORD)m_screen_h, 0.0f, 1.0f };
	m_dev->SetViewport(&vp);
	m_dev->SetVertexShader(nullptr);
	m_dev->SetPixelShader(nullptr);
	m_dev->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
	m_dev->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
	m_dev->SetRenderState(D3DRS_FILLMODE, D3DFILL_SOLID);
	m_dev->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
	m_dev->SetRenderState(D3DRS_LIGHTING, FALSE);
	m_dev->SetRenderState(D3DRS_FOGENABLE, FALSE);
	m_dev->SetRenderState(D3DRS_STENCILENABLE, FALSE);
	m_dev->SetRenderState(D3DRS_SCISSORTESTENABLE, FALSE);
	m_dev->SetRenderState(D3DRS_CLIPPING, TRUE);
	m_dev->SetRenderState(D3DRS_ALPHATESTENABLE, FALSE);
	m_dev->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE);
	m_dev->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
	m_dev->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
	m_dev->SetRenderState(D3DRS_BLENDOP, D3DBLENDOP_ADD);
	m_dev->SetRenderState(D3DRS_COLORWRITEENABLE, 0xF);
	m_dev->SetRenderState(D3DRS_SRGBWRITEENABLE, FALSE);
	m_dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE);
	m_dev->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
	m_dev->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
	m_dev->SetTextureStageState(0, D3DTSS_TEXCOORDINDEX, 0);
	m_dev->SetTextureStageState(0, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE);
	m_dev->SetTextureStageState(1, D3DTSS_COLOROP, D3DTOP_DISABLE);
	m_dev->SetTextureStageState(1, D3DTSS_ALPHAOP, D3DTOP_DISABLE);
	m_dev->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_POINT);
	m_dev->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_POINT);
	m_dev->SetSamplerState(0, D3DSAMP_MIPFILTER, D3DTEXF_NONE);
	m_dev->SetSamplerState(0, D3DSAMP_ADDRESSU, D3DTADDRESS_CLAMP);
	m_dev->SetSamplerState(0, D3DSAMP_ADDRESSV, D3DTADDRESS_CLAMP);
}

void Renderer::end()
{
	if (m_in_frame)
	{
		flush_text();
		m_dev->EndScene();
		m_in_frame = false;
	}
	if (m_old_rt)
	{
		m_dev->SetRenderTarget(0, m_old_rt);
		m_old_rt->Release();
		m_old_rt = nullptr;
	}
	if (m_bb) { m_bb->Release(); m_bb = nullptr; }
	if (m_state) m_state->Apply();
}

void Renderer::rect(float x, float y, float w, float h, D3DCOLOR c)
{
	if (!m_in_frame) return;
	flush_text();  // keep draw order

	ColVert v[4] = {
		{ x - 0.5f,     y - 0.5f,     0, 1, c },
		{ x + w - 0.5f, y - 0.5f,     0, 1, c },
		{ x - 0.5f,     y + h - 0.5f, 0, 1, c },
		{ x + w - 0.5f, y + h - 0.5f, 0, 1, c },
	};
	m_dev->SetTexture(0, nullptr);
	m_dev->SetFVF(FVF_COL);
	m_dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_SELECTARG2);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG2);
	m_dev->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP, 2, v, sizeof(ColVert));
	m_dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
}

void Renderer::line(float x0, float y0, float x1, float y1, D3DCOLOR c)
{
	if (!m_in_frame) return;
	flush_text();

	ColVert v[2] = {
		{ x0, y0, 0, 1, c },
		{ x1, y1, 0, 1, c },
	};
	m_dev->SetTexture(0, nullptr);
	m_dev->SetFVF(FVF_COL);
	m_dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_SELECTARG2);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG2);
	m_dev->DrawPrimitiveUP(D3DPT_LINELIST, 1, v, sizeof(ColVert));
	m_dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE);
	m_dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
}

float Renderer::text_width(const char *s) const
{
	float w = 0;
	for (; *s; s++)
	{
		unsigned char ch = (unsigned char)*s;
		if (ch >= 32 && ch < 127) w += (float)m_cw[ch];
	}
	return w;
}

void Renderer::text(float x, float y, D3DCOLOR c, const char *s, bool shadow)
{
	if (!m_in_frame) return;
	if (shadow)
		text(x + 1, y + 1, (c & 0xFF000000), s, false);

	float cx = x;
	for (; *s; s++)
	{
		unsigned char ch = (unsigned char)*s;
		if (ch < 32 || ch >= 127) continue;
		if (m_tv_count + 6 > kMaxTextVerts) flush_text();

		float w = (float)m_cw[ch], h = (float)m_line_h;
		float x0 = cx - 0.5f, y0 = y - 0.5f, x1 = cx + w - 0.5f, y1 = y + h - 0.5f;
		TexVert *v = &m_tv[m_tv_count];
		v[0] = { x0, y0, 0, 1, c, m_u0[ch], m_v0[ch] };
		v[1] = { x1, y0, 0, 1, c, m_u1[ch], m_v0[ch] };
		v[2] = { x0, y1, 0, 1, c, m_u0[ch], m_v1[ch] };
		v[3] = { x1, y0, 0, 1, c, m_u1[ch], m_v0[ch] };
		v[4] = { x1, y1, 0, 1, c, m_u1[ch], m_v1[ch] };
		v[5] = { x0, y1, 0, 1, c, m_u0[ch], m_v1[ch] };
		m_tv_count += 6;
		cx += w;
	}
}

void Renderer::flush_text()
{
	if (!m_tv_count) return;
	m_dev->SetTexture(0, m_tex);
	m_dev->SetFVF(FVF_TEX);
	m_dev->DrawPrimitiveUP(D3DPT_TRIANGLELIST, m_tv_count / 3, m_tv, sizeof(TexVert));
	m_tv_count = 0;
}
