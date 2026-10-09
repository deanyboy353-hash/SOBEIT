#pragma once

#include <windows.h>
#include <cstdint>

// Polled once per frame from the render hook. Only reads keys while the game window has focus.
class Input
{
public:
	void update(HWND game_window)
	{
		bool focused = game_window && GetForegroundWindow() == game_window;
		for (int vk = 1; vk < 256; vk++)
		{
			m_prev[vk] = m_cur[vk];
			m_cur[vk] = focused && (GetAsyncKeyState(vk) & 0x8000) != 0;
		}
	}

	bool down(int vk) const    { return vk > 0 && vk < 256 && m_cur[vk]; }
	bool pressed(int vk) const { return vk > 0 && vk < 256 && m_cur[vk] && !m_prev[vk]; }

private:
	bool m_cur[256] = {};
	bool m_prev[256] = {};
};

extern Input g_input;
