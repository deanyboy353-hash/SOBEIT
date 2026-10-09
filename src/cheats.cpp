#include "cheats.h"
#include "config.h"
#include "input.h"

#include <cstdio>

using namespace game;

CheatState g_cheats;

namespace
{
	std::string g_toast;
	float       g_toast_time = 0.0f;

	// Airbreak holds its own position so gravity can't make the entity drift between frames.
	void *g_ab_entity = nullptr;
	Vec3  g_ab_pos = {};

	// After a teleport, keep the entity above ground while collision streams in.
	float g_ground_fix_time = 0.0f;
	void *g_ground_fix_entity = nullptr;

	const char *kWeatherNames[] = {
		"Extra sunny LS", "Sunny LS", "Extra sunny smog LS", "Sunny smog LS", "Cloudy LS",
		"Sunny SF", "Extra sunny SF", "Cloudy SF", "Rainy SF", "Foggy SF",
		"Sunny LV", "Extra sunny LV", "Cloudy LV", "Extra sunny countryside", "Sunny countryside",
		"Cloudy countryside", "Rainy countryside", "Extra sunny desert", "Sunny desert",
		"Sandstorm desert", "Underwater", "Extra colours 1", "Extra colours 2",
	};

	void set_heading(void *ped, float heading)
	{
		field<float>(ped, off::PedRotCurrent) = heading;
		field<float>(ped, off::PedRotAim) = heading;
	}

	// Rebuild an upright rotation facing (fx, fy) on the horizontal plane.
	void make_upright(Matrix *m, float fx, float fy)
	{
		float len = std::sqrt(fx * fx + fy * fy);
		if (len < 0.001f) { fx = 0.0f; fy = 1.0f; len = 1.0f; }
		fx /= len;
		fy /= len;
		m->forward = { fx, fy, 0.0f };
		m->up      = { 0.0f, 0.0f, 1.0f };
		m->right   = { fy, -fx, 0.0f };  // forward x up
	}

	void zero_speed(void *e)
	{
		move_speed(e) = { 0, 0, 0 };
		turn_speed(e) = { 0, 0, 0 };
	}

	void update_airbreak(float dt)
	{
		void *e = controlled_entity();
		Matrix *m = matrix_of(e);
		if (!m) return;

		if (e != g_ab_entity)
		{
			g_ab_entity = e;
			g_ab_pos = m->pos;
		}

		Vec3 cf = camera_forward();
		float flen = std::sqrt(cf.x * cf.x + cf.y * cf.y);
		if (flen < 0.001f) { cf = m->forward; flen = std::sqrt(cf.x * cf.x + cf.y * cf.y); }
		if (flen < 0.001f) { cf = { 0, 1, 0 }; flen = 1.0f; }
		float fx = cf.x / flen, fy = cf.y / flen;
		float rx = fy, ry = -fx;

		float speed = g_cfg.airbreak_speed * dt;
		if (g_input.down(g_cfg.key_ab_fast)) speed *= g_cfg.airbreak_fast_mult;

		float f = (g_input.down(g_cfg.key_ab_forward) ? 1.0f : 0.0f) - (g_input.down(g_cfg.key_ab_back) ? 1.0f : 0.0f);
		float s = (g_input.down(g_cfg.key_ab_right) ? 1.0f : 0.0f) - (g_input.down(g_cfg.key_ab_left) ? 1.0f : 0.0f);
		float u = (g_input.down(g_cfg.key_ab_up) ? 1.0f : 0.0f) - (g_input.down(g_cfg.key_ab_down) ? 1.0f : 0.0f);

		g_ab_pos.x += (fx * f + rx * s) * speed;
		g_ab_pos.y += (fy * f + ry * s) * speed;
		g_ab_pos.z += u * speed;

		m->pos = g_ab_pos;
		zero_speed(e);

		if (e == player_ped())
			set_heading(e, std::atan2(-fx, fy));
		else
			make_upright(m, fx, fy);
	}

	void update_ground_fix(float dt)
	{
		if (g_ground_fix_time <= 0.0f) return;
		g_ground_fix_time -= dt;

		void *e = controlled_entity();
		Matrix *m = matrix_of(e);
		if (!m || e != g_ground_fix_entity) { g_ground_fix_time = 0.0f; return; }

		float gz = find_ground_z(m->pos.x, m->pos.y);
		if (gz != 0.0f && m->pos.z < gz - 0.5f)
		{
			m->pos.z = gz + 1.0f;
			zero_speed(e);
		}
	}
}

void cheats::notify(const std::string &msg)
{
	g_toast = msg;
	g_toast_time = 3.0f;
}

const char *cheats::notification(float &alpha)
{
	if (g_toast_time <= 0.0f) return nullptr;
	alpha = g_toast_time > 0.5f ? 1.0f : g_toast_time / 0.5f;
	return g_toast.c_str();
}

const char *cheats::weather_name(int id)
{
	if (id < 0) return "Game default";
	if (id < (int)(sizeof(kWeatherNames) / sizeof(kWeatherNames[0]))) return kWeatherNames[id];
	return "Unknown";
}

void cheats::set_godmode(bool on)
{
	g_cheats.godmode = on;
	if (void *ped = player_ped()) set_proofs(ped, on);
	notify(on ? "Player godmode ON" : "Player godmode OFF");
}

void cheats::set_veh_godmode(bool on)
{
	g_cheats.veh_godmode = on;
	if (void *veh = player_vehicle()) set_proofs(veh, on);
	notify(on ? "Vehicle godmode ON" : "Vehicle godmode OFF");
}

void cheats::toggle_airbreak()
{
	g_cheats.airbreak = !g_cheats.airbreak;
	g_ab_entity = nullptr;
	if (!g_cheats.airbreak)
		if (void *e = controlled_entity()) zero_speed(e);
	notify(g_cheats.airbreak ? "Airbreak ON" : "Airbreak OFF");
}

void cheats::refill_health()
{
	if (void *ped = player_ped())
	{
		float max = field<float>(ped, off::PedMaxHealth);
		field<float>(ped, off::PedHealth) = max > 0.0f ? max : 100.0f;
		notify("Health refilled");
	}
}

void cheats::refill_armour()
{
	if (void *ped = player_ped())
	{
		field<float>(ped, off::PedArmour) = 100.0f;
		notify("Armour refilled");
	}
}

void cheats::give_money(int amount)
{
	int &money = mem<int>(addr::PlayerMoney);
	long long v = (long long)money + amount;
	if (v > 999999999) v = 999999999;
	if (v < 0) v = 0;
	money = (int)v;
	char buf[64];
	snprintf(buf, sizeof(buf), "Money: $%d", money);
	notify(buf);
}

void cheats::clear_wanted()
{
	void *ped = player_ped();
	if (!ped) return;
	void *pdata = field<void *>(ped, off::PedPlayerData);
	if (!pdata) return;
	void *wanted = *reinterpret_cast<void **>(pdata);
	if (!wanted) return;
	field<uint32_t>(wanted, off::WantedChaos) = 0;
	field<uint32_t>(wanted, off::WantedLevel) = 0;
}

void cheats::repair_vehicle()
{
	void *veh = player_vehicle();
	if (!veh) { notify("Not in a vehicle"); return; }
	field<float>(veh, off::VehHealth) = 1000.0f;
	notify("Vehicle health restored");
}

void cheats::unflip_vehicle()
{
	void *veh = player_vehicle();
	Matrix *m = matrix_of(veh);
	if (!m) { notify("Not in a vehicle"); return; }
	make_upright(m, m->forward.x, m->forward.y);
	m->pos.z += 1.0f;
	turn_speed(veh) = { 0, 0, 0 };
	if (g_cheats.airbreak) g_ab_pos = m->pos;
	notify("Vehicle unflipped");
}

void cheats::apply_weather()
{
	if (g_cheats.weather < 0)
	{
		mem<int16_t>(addr::ForcedWeather) = -1;  // hand weather back to the game
		return;
	}
	int16_t w = (int16_t)g_cheats.weather;
	mem<int16_t>(addr::ForcedWeather) = w;
	mem<int16_t>(addr::NewWeather) = w;
	mem<int16_t>(addr::OldWeather) = w;
}

void cheats::apply_time()
{
	mem<uint8_t>(addr::ClockHours) = (uint8_t)g_cheats.hour;
	mem<uint8_t>(addr::ClockMinutes) = (uint8_t)g_cheats.minute;
}

void cheats::apply_game_speed()
{
	mem<float>(addr::TimeScale) = g_cheats.game_speed;
}

void cheats::teleport(const Vec3 &p, int interior, bool snap_to_ground)
{
	void *ped = player_ped();
	void *e = controlled_entity();
	Matrix *m = matrix_of(e);
	if (!m) return;

	Vec3 dest = p;
	mem<int>(addr::CurrArea) = interior;
	field<uint8_t>(ped, off::AreaCode) = (uint8_t)interior;
	if (e != ped) field<uint8_t>(e, off::AreaCode) = (uint8_t)interior;

	load_scene(dest);
	if (snap_to_ground)
		dest.z = find_ground_z(dest.x, dest.y) + 1.0f;

	m->pos = dest;
	zero_speed(e);

	if (g_cheats.airbreak)
	{
		g_ab_entity = e;
		g_ab_pos = dest;
	}
	// Map-marker teleports guess the height, so keep correcting it while collision streams in.
	if (snap_to_ground)
	{
		g_ground_fix_entity = e;
		g_ground_fix_time = 2.0f;
	}
}

void cheats::teleport_to_marker()
{
	uint32_t idx = mem<uint32_t>(addr::TargetBlipIndex);
	if (!idx) { notify("No map marker set"); return; }

	uintptr_t trace = addr::RadarTraces + 0x28 * (idx & 0xFFFF);
	Vec3 p = mem<Vec3>(trace + 0x8);
	teleport(p, 0, true);
	notify("Teleported to map marker");
}

void cheats::save_position()
{
	Vec3 p;
	if (!get_position(controlled_entity(), p)) return;

	char name[32];
	snprintf(name, sizeof(name), "Saved %d", (int)g_cfg.teleports.size() + 1);
	Teleport t = { name, p.x, p.y, p.z, mem<int>(addr::CurrArea) };
	bool written = g_cfg.append_teleport(t);
	notify(written ? std::string("Saved position as '") + name + "'" : "Saved position (ini not writable)");
}

void cheats::handle_hotkeys(float dt)
{
	if (g_input.pressed(g_cfg.key_airbreak)) toggle_airbreak();
	if (g_input.pressed(g_cfg.key_godmode)) set_godmode(!g_cheats.godmode);
	if (g_input.pressed(g_cfg.key_marker_tp)) teleport_to_marker();
	if (g_input.pressed(g_cfg.key_repair)) repair_vehicle();
	if (g_input.pressed(g_cfg.key_unflip)) unflip_vehicle();
	if (g_input.pressed(g_cfg.key_hud)) g_cheats.hud = !g_cheats.hud;
	if (g_input.pressed(g_cfg.key_outlines))
	{
		g_cheats.ped_outlines = !g_cheats.ped_outlines;
		notify(g_cheats.ped_outlines ? "Ped outlines ON" : "Ped outlines OFF");
	}

	if (void *veh = player_vehicle())
	{
		Vec3 &v = move_speed(veh);
		if (g_input.down(g_cfg.key_boost))
		{
			// boost along the direction of travel, or forward when standing still
			float len = length(v);
			if (len < 0.05f)
			{
				Matrix *m = matrix_of(veh);
				if (m) v = { m->forward.x * 0.05f, m->forward.y * 0.05f, m->forward.z * 0.05f };
			}
			else
			{
				float k = std::pow(g_cfg.boost_factor, dt);
				float nl = len * k;
				if (nl > g_cfg.boost_max) nl = g_cfg.boost_max;
				float s = nl / len;
				v = { v.x * s, v.y * s, v.z * s };
			}
		}
		if (g_input.down(g_cfg.key_brake))
		{
			float k = std::pow(0.001f, dt);  // ~bleeds off 99.9% of speed per second
			v = { v.x * k, v.y * k, v.z * k };
			turn_speed(veh) = { 0, 0, 0 };
		}
	}
}

void cheats::update(float dt)
{
	if (g_toast_time > 0.0f) g_toast_time -= dt;

	void *ped = player_ped();
	if (!ped) return;

	if (g_cheats.godmode)
	{
		set_proofs(ped, true);
		float max = field<float>(ped, off::PedMaxHealth);
		field<float>(ped, off::PedHealth) = max > 0.0f ? max : 100.0f;
	}

	if (void *veh = player_vehicle())
	{
		if (g_cheats.veh_godmode)
		{
			set_proofs(veh, true);
			field<float>(veh, off::VehHealth) = 1000.0f;
		}
	}

	if (g_cheats.infinite_ammo)
	{
		for (int i = 0; i < 13; i++)
		{
			uintptr_t w = reinterpret_cast<uintptr_t>(ped) + off::PedWeapons + i * off::WeaponSize;
			if (mem<uint32_t>(w + off::WeaponType) != 0 && mem<uint32_t>(w + off::WeaponTotal) < 9999)
				mem<uint32_t>(w + off::WeaponTotal) = 9999;
		}
	}

	if (g_cheats.never_wanted) clear_wanted();
	if (g_cheats.freeze_time) apply_time();
	if (g_cheats.weather >= 0) apply_weather();
	if (g_cheats.game_speed != 1.0f) apply_game_speed();

	if (g_cheats.airbreak) update_airbreak(dt);
	update_ground_fix(dt);
}
