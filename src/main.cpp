// s0beit sp - a single-player trainer for gta_sa.exe v1.0 US, styled after m0d_s0beit_sa 0.3.
// Loaded as an .asi by an ASI loader. Refuses to run inside SA-MP / multiplayer clients.

#include <windows.h>
#include <d3d9.h>
#include <cstdio>
#include <cstring>
#include <string>

#include "cheats.h"
#include "config.h"
#include "esp.h"
#include "game.h"
#include "input.h"
#include "menu.h"
#include "render.h"

Input g_input;

namespace
{
	constexpr const char *kName = "s0beit sp 0.3";

	HMODULE  g_module = nullptr;
	Renderer g_render;
	bool     g_render_ok = false;
	bool     g_initialized = false;
	bool     g_disabled = false;     // set permanently once multiplayer is detected
	HWND     g_window = nullptr;

	LARGE_INTEGER g_freq, g_last;
	float    g_fps = 0.0f;
	int      g_frames = 0;
	float    g_fps_time = 0.0f;
	float    g_mp_check_time = 0.0f;

	using PresentFn = HRESULT(WINAPI *)(IDirect3DDevice9 *, const RECT *, const RECT *, HWND, const RGNDATA *);
	using ResetFn   = HRESULT(WINAPI *)(IDirect3DDevice9 *, D3DPRESENT_PARAMETERS *);
	PresentFn g_orig_present = nullptr;
	ResetFn   g_orig_reset = nullptr;

	bool readable(uintptr_t addr, size_t len)
	{
		MEMORY_BASIC_INFORMATION mbi;
		if (!VirtualQuery(reinterpret_cast<void *>(addr), &mbi, sizeof(mbi))) return false;
		if (mbi.State != MEM_COMMIT || (mbi.Protect & (PAGE_NOACCESS | PAGE_GUARD))) return false;
		return addr + len <= reinterpret_cast<uintptr_t>(mbi.BaseAddress) + mbi.RegionSize;
	}

	bool is_supported_exe()
	{
		return readable(game::addr::VersionCheckUS, 4) && game::mem<uint32_t>(game::addr::VersionCheckUS) == 0x94BF;
	}

	// This build is single-player only: bail out if any multiplayer client is present.
	bool multiplayer_detected()
	{
		const char *mp_modules[] = { "samp.dll", "omp-client.dll", "mtasa.dll", "core.dll", "SAMPFUNCS.asi" };
		for (const char *m : mp_modules)
			if (GetModuleHandleA(m)) return true;

		// SA-MP and open.mp launchers start the exe with "-c ... -h <host> -p <port>"
		const char *cmd = GetCommandLineA();
		return cmd && strstr(cmd, " -h ") && strstr(cmd, " -p ");
	}

	void disable_everything()
	{
		g_disabled = true;
		if (g_cheats.godmode) cheats::set_godmode(false);
		if (g_cheats.veh_godmode) cheats::set_veh_godmode(false);
		g_cheats = CheatState();
	}

	std::string module_dir_file(const char *ext)
	{
		char path[MAX_PATH];
		DWORD n = GetModuleFileNameA(g_module, path, MAX_PATH);
		std::string s(path, n);
		size_t dot = s.find_last_of('.');
		if (dot != std::string::npos) s.resize(dot);
		return s + ext;
	}

	void first_frame(IDirect3DDevice9 *dev)
	{
		g_initialized = true;

		D3DDEVICE_CREATION_PARAMETERS cp;
		if (SUCCEEDED(dev->GetCreationParameters(&cp))) g_window = cp.hFocusWindow;

		g_cfg.load(module_dir_file(".ini"));
		g_cheats.hud = g_cfg.hud_enabled;
		g_render_ok = g_render.init(dev, g_cfg.font_face.c_str(), g_cfg.font_size, true);
		menu::init();

		QueryPerformanceFrequency(&g_freq);
		QueryPerformanceCounter(&g_last);

		if (g_cfg.start_godmode) cheats::set_godmode(true);
		cheats::notify(std::string(kName) + " loaded - press " + vk_name(g_cfg.key_menu) + " for the menu");
	}

	void draw_hud(Renderer &r)
	{
		void *ped = game::player_ped();
		if (!ped) return;

		char buf[256];
		game::Vec3 p = {};
		game::get_position(game::controlled_entity(), p);
		float hp = game::field<float>(ped, game::off::PedHealth);
		float ar = game::field<float>(ped, game::off::PedArmour);

		int len = snprintf(buf, sizeof(buf), "%s | FPS %.0f | HP %.0f | AR %.0f | Pos %.1f %.1f %.1f | Int %d",
		                   kName, g_fps, hp, ar, p.x, p.y, p.z, game::mem<int>(game::addr::CurrArea));
		if (void *veh = game::player_vehicle())
		{
			float speed = game::length(game::move_speed(veh)) * 180.0f;  // move speed units -> ~km/h
			len += snprintf(buf + len, sizeof(buf) - len, " | Veh %.0f HP %.0f km/h",
			                game::field<float>(veh, game::off::VehHealth), speed);
		}

		std::string flags;
		if (g_cheats.godmode) flags += " GOD";
		if (g_cheats.veh_godmode) flags += " VGOD";
		if (g_cheats.airbreak) flags += " AIRBREAK";
		if (g_cheats.infinite_ammo) flags += " AMMO";
		if (g_cheats.never_wanted) flags += " NOWANTED";
		if (g_cheats.freeze_time) flags += " TIME";
		if (g_cheats.ped_outlines) flags += " OUTLINES";

		float lh = r.line_height() + 2.0f;
		r.rect(0, 0, r.screen_w(), lh, 0x90000000);
		r.text(4, 1, 0xFFFFFFFF, buf);
		if (!flags.empty())
			r.text(r.screen_w() - r.text_width(flags.c_str()) - 6, 1, 0xFF40FF40, flags.c_str());
	}

	void draw_toast(Renderer &r)
	{
		float a;
		const char *msg = cheats::notification(a);
		if (!msg) return;
		D3DCOLOR c = ((DWORD)(a * 255.0f) << 24) | 0x00FFFF80;
		r.text(10, r.screen_h() - r.line_height() * 4, c, msg);
	}

	void frame(IDirect3DDevice9 *dev)
	{
		if (!g_initialized) first_frame(dev);

		LARGE_INTEGER now;
		QueryPerformanceCounter(&now);
		float dt = (float)(now.QuadPart - g_last.QuadPart) / (float)g_freq.QuadPart;
		g_last = now;
		if (dt < 0.0f) dt = 0.0f;
		if (dt > 0.1f) dt = 0.1f;

		g_frames++;
		g_fps_time += dt;
		if (g_fps_time >= 1.0f)
		{
			g_fps = g_frames / g_fps_time;
			g_frames = 0;
			g_fps_time = 0.0f;
		}

		g_mp_check_time -= dt;
		if (g_mp_check_time <= 0.0f)
		{
			g_mp_check_time = 1.0f;
			if (multiplayer_detected())
			{
				disable_everything();
				return;
			}
		}

		g_input.update(g_window);  // keep edge state current even while paused
		if (game::in_pause_menu() || !game::player_ped()) return;

		menu::handle_input();
		if (!menu::is_open()) cheats::handle_hotkeys(dt);
		cheats::update(dt);

		if (!g_render_ok || dev->TestCooperativeLevel() != D3D_OK) return;
		if (!g_render.begin()) return;
		if (g_cheats.ped_outlines) esp::draw_ped_outlines(g_render);
		if (g_cheats.hud) draw_hud(g_render);
		menu::draw(g_render);
		draw_toast(g_render);
		g_render.end();
	}

	HRESULT WINAPI hk_present(IDirect3DDevice9 *dev, const RECT *src, const RECT *dst, HWND wnd, const RGNDATA *dirty)
	{
		if (!g_disabled) frame(dev);
		return g_orig_present(dev, src, dst, wnd, dirty);
	}

	HRESULT WINAPI hk_reset(IDirect3DDevice9 *dev, D3DPRESENT_PARAMETERS *pp)
	{
		g_render.on_lost();
		HRESULT hr = g_orig_reset(dev, pp);
		if (SUCCEEDED(hr)) g_render.on_reset();
		return hr;
	}

	// The original must be stored before the slot is swapped: the game thread may call the hook immediately.
	template <typename Fn>
	bool patch_vtable(void **vtable, int index, void *hook, Fn &orig)
	{
		DWORD old;
		if (!VirtualProtect(&vtable[index], sizeof(void *), PAGE_EXECUTE_READWRITE, &old)) return false;
		orig = reinterpret_cast<Fn>(vtable[index]);
		MemoryBarrier();
		InterlockedExchangePointer(&vtable[index], hook);
		VirtualProtect(&vtable[index], sizeof(void *), old, &old);
		return true;
	}

	DWORD WINAPI init_thread(LPVOID)
	{
		// RenderWare creates the device during startup; wait for it.
		IDirect3DDevice9 *dev = nullptr;
		for (int tries = 0; tries < 1200 && !dev; tries++)  // up to 2 minutes
		{
			if (multiplayer_detected()) return 0;
			dev = game::mem<IDirect3DDevice9 *>(game::addr::D3DDevice);
			if (!dev) Sleep(100);
		}
		if (!dev || multiplayer_detected()) return 0;

		void **vtable = *reinterpret_cast<void ***>(dev);
		if (patch_vtable(vtable, 16, reinterpret_cast<void *>(&hk_reset), g_orig_reset))
			patch_vtable(vtable, 17, reinterpret_cast<void *>(&hk_present), g_orig_present);
		return 0;
	}
}

BOOL WINAPI DllMain(HINSTANCE inst, DWORD reason, LPVOID)
{
	if (reason == DLL_PROCESS_ATTACH)
	{
		g_module = inst;
		DisableThreadLibraryCalls(inst);

		if (!is_supported_exe())
		{
			MessageBoxA(nullptr, "s0beit sp only supports gta_sa.exe v1.0 US.\nThe trainer will not be loaded.",
			            kName, MB_OK | MB_ICONWARNING);
			return TRUE;
		}
		if (multiplayer_detected()) return TRUE;  // single-player only, stay inert

		if (HANDLE h = CreateThread(nullptr, 0, init_thread, nullptr, 0, nullptr)) CloseHandle(h);
	}
	return TRUE;
}
