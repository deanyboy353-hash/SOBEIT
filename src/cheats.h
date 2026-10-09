#pragma once

#include "game.h"

#include <string>

struct CheatState
{
	// player
	bool godmode        = false;
	bool infinite_ammo  = false;
	bool never_wanted   = false;
	bool airbreak       = false;

	// vehicle
	bool veh_godmode    = false;

	// world
	int   weather       = -1;    // -1 = don't touch
	bool  freeze_time   = false;
	int   hour          = 12;
	int   minute        = 0;
	float game_speed    = 1.0f;

	// display
	bool  hud           = true;
	bool  ped_outlines  = false;  // NPC skeletons through walls
	bool  outline_labels = true;  // distance / health under each outline
};

extern CheatState g_cheats;

namespace cheats
{
	void update(float dt);          // once per frame, game thread
	void handle_hotkeys(float dt);  // menu closed only

	void set_godmode(bool on);
	void set_veh_godmode(bool on);
	void toggle_airbreak();

	void refill_health();
	void refill_armour();
	void give_money(int amount);
	void clear_wanted();

	void repair_vehicle();
	void unflip_vehicle();

	void apply_weather();
	void apply_time();
	void apply_game_speed();

	void teleport(const game::Vec3 &p, int interior, bool snap_to_ground);
	void teleport_to_marker();
	void save_position();

	void notify(const std::string &msg);
	const char *notification(float &alpha);  // current toast text, or nullptr

	const char *weather_name(int id);
}
