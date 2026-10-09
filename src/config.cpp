#include "config.h"

#include <windows.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>

Config g_cfg;

namespace
{
	struct KeyName { const char *name; int vk; };

	const KeyName kKeys[] = {
		{ "lbutton", VK_LBUTTON }, { "rbutton", VK_RBUTTON }, { "mbutton", VK_MBUTTON },
		{ "backspace", VK_BACK }, { "tab", VK_TAB }, { "enter", VK_RETURN }, { "pause", VK_PAUSE },
		{ "capslock", VK_CAPITAL }, { "escape", VK_ESCAPE }, { "space", VK_SPACE },
		{ "pageup", VK_PRIOR }, { "pagedown", VK_NEXT }, { "end", VK_END }, { "home", VK_HOME },
		{ "left", VK_LEFT }, { "up", VK_UP }, { "right", VK_RIGHT }, { "down", VK_DOWN },
		{ "insert", VK_INSERT }, { "delete", VK_DELETE },
		{ "num0", VK_NUMPAD0 }, { "num1", VK_NUMPAD1 }, { "num2", VK_NUMPAD2 }, { "num3", VK_NUMPAD3 },
		{ "num4", VK_NUMPAD4 }, { "num5", VK_NUMPAD5 }, { "num6", VK_NUMPAD6 }, { "num7", VK_NUMPAD7 },
		{ "num8", VK_NUMPAD8 }, { "num9", VK_NUMPAD9 }, { "multiply", VK_MULTIPLY }, { "add", VK_ADD },
		{ "subtract", VK_SUBTRACT }, { "decimal", VK_DECIMAL }, { "divide", VK_DIVIDE },
		{ "f1", VK_F1 }, { "f2", VK_F2 }, { "f3", VK_F3 }, { "f4", VK_F4 }, { "f5", VK_F5 }, { "f6", VK_F6 },
		{ "f7", VK_F7 }, { "f8", VK_F8 }, { "f9", VK_F9 }, { "f10", VK_F10 }, { "f11", VK_F11 }, { "f12", VK_F12 },
		{ "lshift", VK_LSHIFT }, { "rshift", VK_RSHIFT }, { "lctrl", VK_LCONTROL }, { "rctrl", VK_RCONTROL },
		{ "lalt", VK_LMENU }, { "ralt", VK_RMENU }, { "shift", VK_SHIFT }, { "ctrl", VK_CONTROL }, { "alt", VK_MENU },
	};

	std::string trim(const std::string &s)
	{
		size_t a = s.find_first_not_of(" \t\r\n");
		if (a == std::string::npos) return "";
		size_t b = s.find_last_not_of(" \t\r\n");
		return s.substr(a, b - a + 1);
	}

	std::string lower(std::string s)
	{
		for (char &c : s) c = (char)tolower((unsigned char)c);
		return s;
	}

	int parse_key(const std::string &v, int fallback)
	{
		std::string s = lower(trim(v));
		if (s.empty()) return fallback;
		for (const KeyName &k : kKeys)
			if (s == k.name) return k.vk;
		if (s.size() == 1 && isalnum((unsigned char)s[0]))
			return toupper((unsigned char)s[0]);
		if (s.size() > 2 && s[0] == '0' && s[1] == 'x')
			return (int)strtol(s.c_str(), nullptr, 16);
		return fallback;
	}

	bool parse_bool(const std::string &v) { std::string s = lower(trim(v)); return s == "1" || s == "true" || s == "on" || s == "yes"; }
	float parse_float(const std::string &v) { return (float)atof(trim(v).c_str()); }
}

const char *vk_name(int vk)
{
	for (const KeyName &k : kKeys)
		if (k.vk == vk) return k.name;
	static char buf[8];
	if ((vk >= '0' && vk <= '9') || (vk >= 'A' && vk <= 'Z'))
	{
		buf[0] = (char)vk;
		buf[1] = 0;
		return buf;
	}
	snprintf(buf, sizeof(buf), "0x%02X", vk);
	return buf;
}

bool Config::load(const std::string &file)
{
	path = file;
	std::ifstream in(file);
	if (!in) return false;

	std::string section, line;
	while (std::getline(in, line))
	{
		line = trim(line);
		if (line.empty() || line[0] == ';' || line[0] == '#') continue;
		if (line[0] == '[')
		{
			section = lower(trim(line.substr(1, line.find(']') - 1)));
			continue;
		}
		size_t eq = line.find('=');
		if (eq == std::string::npos) continue;
		std::string key = trim(line.substr(0, eq));
		std::string val = line.substr(eq + 1);
		size_t comment = val.find(';');
		if (comment != std::string::npos) val.resize(comment);
		val = trim(val);
		std::string lkey = lower(key);

		if (section == "keys")
		{
			struct { const char *n; int *p; } binds[] = {
				{ "menu", &key_menu }, { "airbreak", &key_airbreak }, { "godmode", &key_godmode },
				{ "marker_teleport", &key_marker_tp }, { "vehicle_repair", &key_repair },
				{ "vehicle_unflip", &key_unflip }, { "vehicle_boost", &key_boost },
				{ "vehicle_brake", &key_brake }, { "hud", &key_hud },
				{ "airbreak_forward", &key_ab_forward }, { "airbreak_back", &key_ab_back },
				{ "airbreak_left", &key_ab_left }, { "airbreak_right", &key_ab_right },
				{ "airbreak_up", &key_ab_up }, { "airbreak_down", &key_ab_down },
				{ "airbreak_fast", &key_ab_fast },
			};
			for (auto &b : binds)
				if (lkey == b.n) *b.p = parse_key(val, *b.p);
		}
		else if (section == "settings")
		{
			if (lkey == "airbreak_speed") airbreak_speed = parse_float(val);
			else if (lkey == "airbreak_fast_mult") airbreak_fast_mult = parse_float(val);
			else if (lkey == "boost_factor") boost_factor = parse_float(val);
			else if (lkey == "boost_max") boost_max = parse_float(val);
			else if (lkey == "hud") hud_enabled = parse_bool(val);
			else if (lkey == "start_godmode") start_godmode = parse_bool(val);
			else if (lkey == "menu_x") menu_x = parse_float(val);
			else if (lkey == "menu_y") menu_y = parse_float(val);
			else if (lkey == "font_size") font_size = atoi(val.c_str());
			else if (lkey == "font_face") font_face = val;
		}
		else if (section == "teleports")
		{
			Teleport t = { key, 0, 0, 0, 0 };
			if (sscanf(val.c_str(), "%f , %f , %f , %d", &t.x, &t.y, &t.z, &t.interior) >= 3)
				teleports.push_back(t);
		}
	}

	if (font_size < 8) font_size = 8;
	if (font_size > 32) font_size = 32;
	return true;
}

bool Config::append_teleport(const Teleport &t)
{
	teleports.push_back(t);
	if (path.empty()) return false;

	// Teleports are the last section of the shipped ini, so appending lands in [teleports].
	bool exists = GetFileAttributesA(path.c_str()) != INVALID_FILE_ATTRIBUTES;
	std::ofstream out(path, std::ios::app);
	if (!out) return false;
	if (!exists) out << "[teleports]\n";
	char buf[256];
	// Leading newline guards against a last line without one; blank lines are ignored on load.
	snprintf(buf, sizeof(buf), "\n%s = %.2f, %.2f, %.2f, %d", t.name.c_str(), t.x, t.y, t.z, t.interior);
	out << buf;
	return true;
}
