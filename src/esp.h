// Ped outlines: draws every NPC's skeleton as a 2D overlay so it stays visible through walls.
// Single-player only, like the rest of the trainer.
#pragma once

class Renderer;

namespace esp
{
	void draw_ped_outlines(Renderer &r);
}
