#!/usr/bin/env python3
"""Generate a compact square SVG silhouette from the PCA region GeoJSON."""

import argparse
import json
import math
from pathlib import Path


def ring_area(points):
    return abs(
        sum(
            left[0] * right[1] - right[0] * left[1]
            for left, right in zip(points, points[1:] + points[:1])
        )
        / 2
    )


def point_line_distance(point, start, end):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.dist(point, start)
    distance = abs(
        dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]
    )
    return distance / math.hypot(dx, dy)


def simplify(points, tolerance):
    if len(points) <= 3:
        return points
    greatest_distance = 0
    greatest_index = 0
    for index, point in enumerate(points[1:-1], start=1):
        distance = point_line_distance(point, points[0], points[-1])
        if distance > greatest_distance:
            greatest_distance = distance
            greatest_index = index
    if greatest_distance <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[: greatest_index + 1], tolerance)[:-1] + simplify(
        points[greatest_index:], tolerance
    )


def exterior_rings(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    if geometry["type"] == "MultiPolygon":
        return [polygon[0] for polygon in geometry["coordinates"]]
    raise ValueError("Only Polygon and MultiPolygon geometries are supported")


def format_number(value):
    return ("{:.2f}".format(value)).rstrip("0").rstrip(".")


def fit_rings(rings, size, padding):
    all_points = [point for ring in rings for point in ring]
    minimum_x = min(point[0] for point in all_points)
    maximum_x = max(point[0] for point in all_points)
    minimum_y = min(point[1] for point in all_points)
    maximum_y = max(point[1] for point in all_points)
    scale = min(
        (size - 2 * padding) / (maximum_x - minimum_x),
        (size - 2 * padding) / (maximum_y - minimum_y),
    )
    offset_x = (size - (maximum_x - minimum_x) * scale) / 2
    offset_y = (size - (maximum_y - minimum_y) * scale) / 2
    return [
        [
            (
                offset_x + (point[0] - minimum_x) * scale,
                offset_y + (point[1] - minimum_y) * scale,
            )
            for point in ring
        ]
        for ring in rings
    ]


def build_svg(feature, size, padding, minimum_area, minimum_islands, tolerance):
    rings = exterior_rings(feature["geometry"])
    latitude = sum(point[1] for ring in rings for point in ring) / sum(
        len(ring) for ring in rings
    )
    longitude_scale = math.cos(math.radians(latitude))
    projected = [
        [(point[0] * longitude_scale, -point[1]) for point in ring]
        for ring in rings
    ]
    preliminary = fit_rings(projected, size, padding)
    ranked = sorted(
        zip(projected, preliminary), key=lambda pair: ring_area(pair[1]), reverse=True
    )
    visible_projected = [
        projected_ring
        for index, (projected_ring, fitted_ring) in enumerate(ranked)
        if index < minimum_islands or ring_area(fitted_ring) >= minimum_area
    ]
    visible = fit_rings(visible_projected, size, padding)
    paths = []
    point_count = 0
    for ring in visible:
        open_ring = ring[:-1] if ring[0] == ring[-1] else ring
        simplified = simplify(open_ring + [open_ring[0]], tolerance)
        if len(simplified) < 4:
            continue
        point_count += len(simplified)
        commands = [
            "M{} {}".format(
                format_number(simplified[0][0]), format_number(simplified[0][1])
            )
        ]
        commands.extend(
            "L{} {}".format(format_number(point[0]), format_number(point[1]))
            for point in simplified[1:-1]
        )
        paths.append(" ".join(commands) + " Z")
    label = feature["properties"].get("source_name", "Philippine region")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {0} {0}" '
        'role="img" aria-label="{1} silhouette">\n'
        '  <path fill="#000" d="{2}"/>\n'
        "</svg>\n"
    ).format(size, label, " ".join(paths))
    return svg, len(rings), len(visible), point_count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--region", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--size", type=int, default=64)
    parser.add_argument("--padding", type=float, default=1.5)
    parser.add_argument("--minimum-area", type=float, default=0.35)
    parser.add_argument("--minimum-islands", type=int, default=12)
    parser.add_argument("--tolerance", type=float, default=0.28)
    arguments = parser.parse_args()

    document = json.loads(arguments.source.read_text(encoding="utf-8"))
    feature = next(
        (
            feature
            for feature in document["features"]
            if feature["properties"].get("region_code") == arguments.region
        ),
        None,
    )
    if feature is None:
        raise SystemExit("Unknown region code: {}".format(arguments.region))
    svg, source_islands, visible_islands, point_count = build_svg(
        feature,
        arguments.size,
        arguments.padding,
        arguments.minimum_area,
        arguments.minimum_islands,
        arguments.tolerance,
    )
    arguments.output.write_text(svg, encoding="utf-8")
    print(
        "Generated {} from {} source polygons: {} visible islands, {} SVG points".format(
            arguments.output, source_islands, visible_islands, point_count
        )
    )


if __name__ == "__main__":
    main()
