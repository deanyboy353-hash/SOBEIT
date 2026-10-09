#pragma once

#include <string>
#include <vector>

struct Teleport
{
	std::string name;
	float x, y, z;
	int interior;
};

struct Config
{
	// hotkeys (virtual-key codes)
	int key_menu        = 0x2D;  // VK_INSERT
	int key_airbreak    = 0xA1;  // VK_RSHIFT
	int key_godmode     = 0x2E;  // VK_DELETE
	int key_marker_tp   = 0x24;  // VK_HOME
	int key_repair      = 0x23;  // VK_END
	int key_unflip      = 0x22;  // VK_NEXT (page down)
	int key_boost       = 0xA4;  // VK_LMENU (left alt), hold
	int key_brake       = 0x08;  // VK_BACK, hold
	int key_hud         = 0x7A;  // VK_F11

	// airbreak movement keys
	int key_ab_forward  = 'W';
	int key_ab_back     = 'S';
	int key_ab_left     = 'A';
	int key_ab_right    = 'D';
	int key_ab_up       = 0x20;  // VK_SPACE
	int key_ab_down     = 0xA2;  // VK_LCONTROL
	int key_ab_fast     = 0xA0;  // VK_LSHIFT

	float airbreak_speed      = 25.0f;  // units per second
	float airbreak_fast_mult  = 4.0f;
	float boost_factor        = 1.5f;   // velocity multiplier per second while held
	float boost_max           = 4.0f;   // max move-speed magnitude (~720 km/h)

	bool  hud_enabled   = true;
	bool  start_godmode = false;
	float menu_x        = 20.0f;
	float menu_y        = 180.0f;
	int   font_size     = 14;
	std::string font_face = "Tahoma";

	std::vector<Teleport> teleports;

	std::string path;

	bool load(const std::string &file);
	bool append_teleport(const Teleport &t);
};

const char *vk_name(int vk);

extern Config g_cfg;
