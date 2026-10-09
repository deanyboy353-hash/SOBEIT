// Minimal 2D renderer on top of the game's D3D9 device: filled rects and a bitmap font baked
// from a GDI font into a texture (same approach as the CD3DFont class the original mod used).
#pragma once

#include <d3d9.h>
#include <cstdint>

class Renderer
{
public:
	bool init(IDirect3DDevice9 *dev, const char *face, int height_px, bool bold);
	void shutdown();

	// Call around Reset(): drops/recreates the default-pool state block.
	void on_lost();
	void on_reset();

	bool begin();  // saves device state, sets up 2D state; false if not ready
	void end();    // flushes and restores device state

	void rect(float x, float y, float w, float h, D3DCOLOR c);
	void text(float x, float y, D3DCOLOR c, const char *s, bool shadow = true);
	float text_width(const char *s) const;
	float line_height() const { return (float)m_line_h; }

	float screen_w() const { return m_screen_w; }
	float screen_h() const { return m_screen_h; }

private:
	struct TexVert { float x, y, z, rhw; D3DCOLOR c; float u, v; };
	struct ColVert { float x, y, z, rhw; D3DCOLOR c; };

	void flush_text();
	void setup_state();

	IDirect3DDevice9      *m_dev = nullptr;
	IDirect3DTexture9     *m_tex = nullptr;
	IDirect3DStateBlock9  *m_state = nullptr;
	IDirect3DSurface9     *m_old_rt = nullptr;
	IDirect3DSurface9     *m_bb = nullptr;

	int   m_tex_w = 512, m_tex_h = 512;
	int   m_line_h = 0;
	float m_u0[128] = {}, m_v0[128] = {}, m_u1[128] = {}, m_v1[128] = {};
	int   m_cw[128] = {};
	float m_screen_w = 0, m_screen_h = 0;

	static constexpr int kMaxTextVerts = 6 * 2048;
	TexVert m_tv[kMaxTextVerts];
	int     m_tv_count = 0;
	bool    m_in_frame = false;
};
