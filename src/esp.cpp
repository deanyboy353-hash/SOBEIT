#include "esp.h"
#include "cheats.h"
#include "config.h"
#include "game.h"
#include "render.h"

#include <cstdio>

using namespace game;

namespace
{
	// GTA SA ped bone ids
	enum Bone : unsigned
	{
		Pelvis1 = 1, Pelvis = 2, Spine1 = 3, UpperTorso = 4, Neck = 5, Head = 8,
		RShoulder = 22, RElbow = 23, RWrist = 24, RHand = 25,
		LShoulder = 32, LElbow = 33, LWrist = 34, LHand = 35,
		LHip = 41, LKnee = 42, LAnkle = 43, LFoot = 44,
		RHip = 51, RKnee = 52, RAnkle = 53, RFoot = 54,
	};

	const unsigned kSkeleton[][2] = {
		{ Head, Neck }, { Neck, UpperTorso }, { UpperTorso, Spine1 }, { Spine1, Pelvis },
		{ UpperTorso, RShoulder }, { RShoulder, RElbow }, { RElbow, RWrist }, { RWrist, RHand },
		{ UpperTorso, LShoulder }, { LShoulder, LElbow }, { LElbow, LWrist }, { LWrist, LHand },
		{ Pelvis, RHip }, { RHip, RKnee }, { RKnee, RAnkle }, { RAnkle, RFoot },
		{ Pelvis, LHip }, { LHip, LKnee }, { LKnee, LAnkle }, { LAnkle, LFoot },
	};

	D3DCOLOR colour_for(void *ped)
	{
		if (field<float>(ped, off::PedHealth) <= 0.0f) return 0xC0808080;  // dead

		switch (field<uint32_t>(ped, off::PedType))
		{
		case 6:  return 0xFF4080FF;  // cop
		case 8:  return 0xFF40FF40;  // Grove Street Families
		case 7: case 9: case 10: case 11: case 12: case 13: case 14: case 15: case 16:
			return 0xFFFF9020;       // other gangs
		case 17: case 20: return 0xFFFF4040;  // dealer / criminal
		default: return 0xFFFFFFFF;  // civilians and everyone else
		}
	}

	float dist(const Vec3 &a, const Vec3 &b)
	{
		Vec3 d = { a.x - b.x, a.y - b.y, a.z - b.z };
		return length(d);
	}

	// Fallback for peds the game didn't animate this frame (bone matrices are stale):
	// a box from feet to head around the entity position.
	void draw_box(Renderer &r, const Vec3 &pos, D3DCOLOR c)
	{
		float fx, fy, hx, hy;
		Vec3 feet = { pos.x, pos.y, pos.z - 1.0f };
		Vec3 head = { pos.x, pos.y, pos.z + 0.9f };
		if (!world_to_screen(feet, r.screen_w(), r.screen_h(), fx, fy)) return;
		if (!world_to_screen(head, r.screen_w(), r.screen_h(), hx, hy)) return;
		float h = fy - hy, w = h * 0.35f;
		r.line(hx - w, hy, hx + w, hy, c);
		r.line(hx + w, hy, fx + w, fy, c);
		r.line(fx + w, fy, fx - w, fy, c);
		r.line(fx - w, fy, hx - w, hy, c);
	}
}

void esp::draw_ped_outlines(Renderer &r)
{
	void *self = player_ped();
	Vec3 me;
	if (!self || !get_position(self, me)) return;

	const float max_dist = g_cfg.outline_distance;
	const float sw = r.screen_w(), sh = r.screen_h();

	for_each_ped([&](void *ped) {
		if (ped == self) return;
		if (!field<void *>(ped, off::RwObject)) return;  // not modelled yet

		Vec3 pos;
		if (!get_position(ped, pos)) return;
		float d = dist(me, pos);
		if (d > max_dist) return;

		float px, py;
		if (!world_to_screen(pos, sw, sh, px, py)) return;  // behind the camera

		D3DCOLOR c = colour_for(ped);

		// Bones are only refreshed when the ped is rendered; if they're far from the ped's
		// actual position, the skeleton would be drawn in the wrong place.
		Vec3 pelvis = bone_position(ped, Pelvis);
		if (dist(pelvis, pos) > 2.0f)
		{
			draw_box(r, pos, c);
		}
		else
		{
			for (const auto &seg : kSkeleton)
			{
				float x0, y0, x1, y1;
				if (world_to_screen(bone_position(ped, seg[0]), sw, sh, x0, y0) &&
				    world_to_screen(bone_position(ped, seg[1]), sw, sh, x1, y1))
					r.line(x0, y0, x1, y1, c);
			}

			// head marker scaled with distance
			float hx, hy;
			if (world_to_screen(bone_position(ped, Head), sw, sh, hx, hy))
			{
				float s = 120.0f / (d > 1.0f ? d : 1.0f);
				if (s < 2.0f) s = 2.0f;
				if (s > 12.0f) s = 12.0f;
				r.line(hx - s, hy - s, hx + s, hy - s, c);
				r.line(hx + s, hy - s, hx + s, hy + s, c);
				r.line(hx + s, hy + s, hx - s, hy + s, c);
				r.line(hx - s, hy + s, hx - s, hy - s, c);
			}
		}

		if (g_cheats.outline_labels)
		{
			char buf[48];
			snprintf(buf, sizeof(buf), "%.0fm  %.0f HP", d, field<float>(ped, off::PedHealth));
			float tx, ty;
			Vec3 above = { pos.x, pos.y, pos.z + 1.2f };
			if (world_to_screen(above, sw, sh, tx, ty))
				r.text(tx - r.text_width(buf) / 2, ty - r.line_height(), c, buf);
		}
	});
}
