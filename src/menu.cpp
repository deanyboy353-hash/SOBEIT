#include "menu.h"
#include "cheats.h"
#include "config.h"
#include "input.h"
#include "render.h"

#include <cmath>
#include <cstdio>

namespace
{
	struct Level
	{
		MenuItem *item;
		int sel;
	};

	MenuItem g_root;
	std::vector<Level> g_stack;
	bool g_open = false;

	MenuItem sub(const std::string &label, std::vector<MenuItem> children)
	{
		MenuItem m;
		m.type = MenuItem::Submenu;
		m.label = label;
		m.children = std::move(children);
		return m;
	}

	MenuItem toggle(const std::string &label, bool *b, std::function<void()> on_change = nullptr)
	{
		MenuItem m;
		m.type = MenuItem::Toggle;
		m.label = label;
		m.b = b;
		m.on_change = std::move(on_change);
		return m;
	}

	MenuItem action(const std::string &label, std::function<void()> fn)
	{
		MenuItem m;
		m.type = MenuItem::Action;
		m.label = label;
		m.on_change = std::move(fn);
		return m;
	}

	MenuItem int_value(const std::string &label, int *v, int lo, int hi, int step,
	                   std::function<void()> on_change = nullptr, std::function<std::string()> text = nullptr)
	{
		MenuItem m;
		m.type = MenuItem::IntValue;
		m.label = label;
		m.i = v;
		m.imin = lo;
		m.imax = hi;
		m.istep = step;
		m.on_change = std::move(on_change);
		m.value_text = std::move(text);
		return m;
	}

	MenuItem float_value(const std::string &label, float *v, float lo, float hi, float step,
	                     std::function<void()> on_change = nullptr)
	{
		MenuItem m;
		m.type = MenuItem::FloatValue;
		m.label = label;
		m.f = v;
		m.fmin = lo;
		m.fmax = hi;
		m.fstep = step;
		m.on_change = std::move(on_change);
		return m;
	}

	std::string two_digits(int v)
	{
		char buf[8];
		snprintf(buf, sizeof(buf), "%02d", v);
		return buf;
	}

	void build_teleports(std::vector<MenuItem> &out)
	{
		out.clear();
		out.push_back(action("Map marker", [] { cheats::teleport_to_marker(); }));
		out.push_back(action("Save current position", [] { cheats::save_position(); }));
		for (size_t n = 0; n < g_cfg.teleports.size(); n++)
		{
			out.push_back(action(g_cfg.teleports[n].name, [n] {
				if (n >= g_cfg.teleports.size()) return;
				const Teleport &t = g_cfg.teleports[n];
				cheats::teleport({ t.x, t.y, t.z }, t.interior, false);
				cheats::notify("Teleported to " + t.name);
			}));
		}
	}

	std::vector<MenuItem> &items_of(MenuItem *m) { return m->children; }

	void enter(MenuItem *m)
	{
		if (m->build) m->build(m->children);
		g_stack.push_back({ m, 0 });
	}

	void adjust(MenuItem &it, int dir)
	{
		switch (it.type)
		{
		case MenuItem::IntValue:
		{
			int v = *it.i + dir * it.istep;
			if (v > it.imax) v = it.imin;  // wrap, like the original's list values
			if (v < it.imin) v = it.imax;
			*it.i = v;
			if (it.on_change) it.on_change();
			break;
		}
		case MenuItem::FloatValue:
		{
			float v = std::round((*it.f + dir * it.fstep) / it.fstep) * it.fstep;  // no drift from repeated steps
			if (v > it.fmax) v = it.fmax;
			if (v < it.fmin) v = it.fmin;
			*it.f = v;
			if (it.on_change) it.on_change();
			break;
		}
		default:
			break;
		}
	}

	void activate(MenuItem &it)
	{
		switch (it.type)
		{
		case MenuItem::Submenu:
			enter(&it);
			break;
		case MenuItem::Toggle:
			if (it.on_change) it.on_change();  // setter flips the flag itself
			else *it.b = !*it.b;
			break;
		case MenuItem::Action:
			if (it.on_change) it.on_change();
			break;
		case MenuItem::IntValue:
		case MenuItem::FloatValue:
			adjust(it, +1);
			break;
		}
	}

	std::string value_of(const MenuItem &it)
	{
		if (it.value_text) return it.value_text();
		char buf[64];
		switch (it.type)
		{
		case MenuItem::Toggle:     return *it.b ? "ON" : "OFF";
		case MenuItem::IntValue:   snprintf(buf, sizeof(buf), "%d", *it.i); return buf;
		case MenuItem::FloatValue: snprintf(buf, sizeof(buf), "%.2f", *it.f); return buf;
		case MenuItem::Submenu:    return ">";
		default:                   return "";
		}
	}
}

void menu::init()
{
	g_root = sub("s0beit sp", {
		sub("Player", {
			toggle("Godmode", &g_cheats.godmode, [] { cheats::set_godmode(!g_cheats.godmode); }),
			toggle("Airbreak", &g_cheats.airbreak, [] { cheats::toggle_airbreak(); }),
			float_value("Airbreak speed", &g_cfg.airbreak_speed, 5.0f, 200.0f, 5.0f),
			toggle("Infinite ammo", &g_cheats.infinite_ammo),
			toggle("Never wanted", &g_cheats.never_wanted),
			action("Clear wanted level", [] { cheats::clear_wanted(); cheats::notify("Wanted level cleared"); }),
			action("Refill health", [] { cheats::refill_health(); }),
			action("Refill armour", [] { cheats::refill_armour(); }),
			action("Give $1,000,000", [] { cheats::give_money(1000000); }),
		}),
		sub("Vehicle", {
			toggle("Vehicle godmode", &g_cheats.veh_godmode, [] { cheats::set_veh_godmode(!g_cheats.veh_godmode); }),
			action("Repair", [] { cheats::repair_vehicle(); }),
			action("Unflip", [] { cheats::unflip_vehicle(); }),
			float_value("Boost factor", &g_cfg.boost_factor, 1.1f, 10.0f, 0.1f),
			float_value("Boost max speed", &g_cfg.boost_max, 1.0f, 10.0f, 0.5f),
		}),
		[] {
			MenuItem t = sub("Teleports", {});
			t.build = build_teleports;
			return t;
		}(),
		sub("World", {
			int_value("Weather", &g_cheats.weather, -1, 22, 1, [] { cheats::apply_weather(); },
			          [] { char b[64]; snprintf(b, sizeof(b), "%d %s", g_cheats.weather, cheats::weather_name(g_cheats.weather)); return std::string(b); }),
			int_value("Hour", &g_cheats.hour, 0, 23, 1, [] { cheats::apply_time(); }, [] { return two_digits(g_cheats.hour); }),
			int_value("Minute", &g_cheats.minute, 0, 59, 5, [] { cheats::apply_time(); }, [] { return two_digits(g_cheats.minute); }),
			toggle("Freeze time", &g_cheats.freeze_time),
			float_value("Game speed", &g_cheats.game_speed, 0.1f, 4.0f, 0.1f, [] { cheats::apply_game_speed(); }),
		}),
		sub("Settings", {
			toggle("Status HUD", &g_cheats.hud),
		}),
	});
}

bool menu::is_open() { return g_open; }

void menu::handle_input()
{
	if (g_input.pressed(g_cfg.key_menu))
	{
		g_open = !g_open;
		if (g_open)
		{
			if (!g_cheats.freeze_time)
			{
				g_cheats.hour = game::mem<uint8_t>(game::addr::ClockHours);
				g_cheats.minute = game::mem<uint8_t>(game::addr::ClockMinutes);
			}
			g_stack.clear();
			g_stack.push_back({ &g_root, 0 });
		}
		return;
	}
	if (!g_open || g_stack.empty()) return;

	Level &lv = g_stack.back();
	std::vector<MenuItem> &items = items_of(lv.item);
	int n = (int)items.size();

	if (g_input.pressed(VK_UP) && n) lv.sel = (lv.sel - 1 + n) % n;
	if (g_input.pressed(VK_DOWN) && n) lv.sel = (lv.sel + 1) % n;
	if (lv.sel >= n) lv.sel = n ? n - 1 : 0;

	MenuItem *cur = n ? &items[lv.sel] : nullptr;
	bool is_value = cur && (cur->type == MenuItem::IntValue || cur->type == MenuItem::FloatValue);

	if (g_input.pressed(VK_RETURN) && cur)
	{
		activate(*cur);
	}
	else if (g_input.pressed(VK_RIGHT) && cur)
	{
		if (is_value) adjust(*cur, +1);
		else activate(*cur);
	}
	else if (g_input.pressed(VK_LEFT))
	{
		if (is_value) adjust(*cur, -1);
		else if (g_stack.size() > 1) g_stack.pop_back();
	}
	else if (g_input.pressed(VK_BACK))
	{
		if (g_stack.size() > 1) g_stack.pop_back();
		else g_open = false;
	}
}

void menu::draw(Renderer &r)
{
	if (!g_open || g_stack.empty()) return;

	const D3DCOLOR kBg       = 0xC0101010;
	const D3DCOLOR kTitleBg  = 0xE0204060;
	const D3DCOLOR kSelBg    = 0xA03060A0;
	const D3DCOLOR kText     = 0xFFE0E0E0;
	const D3DCOLOR kTitle    = 0xFFFFFFFF;
	const D3DCOLOR kOn       = 0xFF40FF40;
	const D3DCOLOR kOff      = 0xFFFF5050;
	const D3DCOLOR kValue    = 0xFFFFD040;
	const D3DCOLOR kHint     = 0xFFA0A0A0;

	Level &lv = g_stack.back();
	std::vector<MenuItem> &items = items_of(lv.item);

	std::string title = g_root.label;
	for (size_t k = 1; k < g_stack.size(); k++)
		title += " > " + g_stack[k].item->label;

	float lh = r.line_height() + 2.0f;
	float pad = 6.0f;

	float label_w = 0, value_w = 0;
	for (const MenuItem &it : items)
	{
		float lw = r.text_width(it.label.c_str());
		float vw = r.text_width(value_of(it).c_str());
		if (lw > label_w) label_w = lw;
		if (vw > value_w) value_w = vw;
	}
	const char *hint = "Up/Down select   Enter/Right use   Left/Bksp back";
	float w = label_w + value_w + pad * 4;
	if (r.text_width(title.c_str()) + pad * 2 > w) w = r.text_width(title.c_str()) + pad * 2;
	if (r.text_width(hint) + pad * 2 > w) w = r.text_width(hint) + pad * 2;

	// keep long lists (teleports) on screen by scrolling around the selection
	int visible = (int)((r.screen_h() - g_cfg.menu_y - lh * 3) / lh);
	if (visible < 5) visible = 5;
	int count = (int)items.size();
	int first = 0;
	if (count > visible)
	{
		first = lv.sel - visible / 2;
		if (first < 0) first = 0;
		if (first > count - visible) first = count - visible;
	}
	int shown = count < visible ? count : visible;

	float x = g_cfg.menu_x, y = g_cfg.menu_y;
	float h = lh * (shown + 2) + pad;

	r.rect(x, y, w, lh, kTitleBg);
	r.text(x + pad, y + 1, kTitle, title.c_str());
	r.rect(x, y + lh, w, h - lh, kBg);

	float iy = y + lh + pad / 2;
	for (int k = first; k < first + shown; k++)
	{
		const MenuItem &it = items[k];
		if (k == lv.sel) r.rect(x + 2, iy, w - 4, lh, kSelBg);
		r.text(x + pad, iy + 1, kText, it.label.c_str());

		std::string v = value_of(it);
		D3DCOLOR vc = kValue;
		if (it.type == MenuItem::Toggle) vc = *it.b ? kOn : kOff;
		r.text(x + w - pad - r.text_width(v.c_str()), iy + 1, vc, v.c_str());
		iy += lh;
	}
	r.text(x + pad, iy + 1, kHint, hint);
}
