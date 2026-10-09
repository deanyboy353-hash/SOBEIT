#pragma once

#include <functional>
#include <string>
#include <vector>

class Renderer;

struct MenuItem
{
	enum Type { Submenu, Toggle, Action, IntValue, FloatValue };

	Type type = Action;
	std::string label;

	bool  *b = nullptr;
	int   *i = nullptr;
	float *f = nullptr;
	int   imin = 0, imax = 0, istep = 1;
	float fmin = 0, fmax = 0, fstep = 0.1f;

	std::function<void()> on_change;                      // toggles, values, actions
	std::function<std::string()> value_text;              // overrides the default value display
	std::vector<MenuItem> children;                       // static submenu
	std::function<void(std::vector<MenuItem> &)> build;   // dynamic submenu, rebuilt on enter
};

namespace menu
{
	void init();
	bool is_open();
	void handle_input();    // call every frame
	void draw(Renderer &r);
}
