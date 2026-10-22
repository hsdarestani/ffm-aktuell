import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const atlas=readUiSource('components/Atlas3D.tsx');
const css=readUiSource('app/atlas-readable.css');

test('3D default cannot zoom so far out that all buildings vanish',()=>{
 assert.match(atlas,/const MIN_3D_ZOOM=13\.15/);
 assert.match(atlas,/const MIN_2D_ZOOM=10\.8/);
 assert.match(atlas,/minZoom:MIN_3D_ZOOM/);
 assert.match(atlas,/map\.setMinZoom\(is3D&&!luftbild\?MIN_3D_ZOOM:MIN_2D_ZOOM\)/);
 assert.match(atlas,/const min=state\.current\.is3D\?MIN_3D_ZOOM:MIN_2D_ZOOM/);
 assert.match(atlas,/fill-extrusion-height.*interpolate/);
 assert.match(atlas,/12\.2,\['\*',0\.45/);
 assert.match(atlas,/zoom:14\.35,pitch:CITY_PITCH/);
 assert.match(atlas,/\[is3D,set3D\]=useState\(true\)/);
});

test('out-of-view and out-of-scale venue selections are cleared for any map movement',()=>{
 assert.match(atlas,/const selectionRef=useRef<string\|null>\(null\)/);
 assert.match(atlas,/selectionRef\.current=selected/);
 assert.match(atlas,/map\.project\(\[place\.longitude as number,place\.latitude as number\]\)/);
 assert.match(atlas,/map\.getContainer\(\)/);
 assert.match(atlas,/if\(map\.getZoom\(\)<14\.05\|\|outside\)setSelected\(null\)/);
 assert.match(atlas,/map\.on\('moveend',reconcileSelection\)/);
 assert.match(atlas,/map\.off\('moveend',reconcileSelection\)/);
 assert.match(atlas,/selectedPlace\?<'?div className="atlas-selection"/);
});

test('empty location state is a small district button, not another bottom information panel',()=>{
 assert.match(css,/atlas-bottom:not\(\.atlas-bottom-selected\)/);
 assert.match(css,/\.atlas-bottom-copy\{display:none\}/);
 assert.match(css,/\.atlas-district-toggle/);
 assert.match(atlas,/aria-label="Stadtteil wählen"/);
});

