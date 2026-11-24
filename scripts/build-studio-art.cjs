const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '../static/pond/art-catalog.json');
const catalog = JSON.parse(fs.readFileSync(target, 'utf8'));
const leaves = {
  folded: '<ellipse cx="60" cy="72" rx="43" ry="12" fill="{leaf_color}"/><path d="m17 65 5-30 14 27 8-35 16 32 16-32 8 35 14-27 5 30-22 13H39Z" fill="{leaf_color}" stroke="#e0edba" stroke-opacity=".5" stroke-width=".7"/><path d="m22 35 7 31m15-39 8 34m24-34-8 34m30-26-7 31" stroke="#f1f2c6" stroke-opacity=".25" stroke-width="1"/>',
  round: '<ellipse cx="60" cy="72" rx="44" ry="12" fill="{leaf_color}"/>' + [20,36,52,68,84,100].map((x,i)=>`<path d="M${x} 70Q${x-15} 48 ${x} ${35+Math.abs(60-x)/4}Q${x+15} 48 ${x} 70Z" fill="{leaf_color}" stroke="#daebbb" stroke-opacity=".55" stroke-width=".7"/>`).join(''),
  lotus: '<ellipse cx="60" cy="75" rx="44" ry="10" fill="{leaf_color}"/><path d="M60 73Q22 64 15 40Q45 34 60 68Q75 34 105 40Q98 64 60 73Z" fill="{leaf_color}" stroke="#e6efbf" stroke-opacity=".5"/><path d="M60 74Q35 48 60 24Q85 48 60 74Z" fill="{color}" stroke="#ffe2c0" stroke-opacity=".8"/><path d="M60 77Q32 66 29 46Q53 46 60 72Q67 46 91 46Q88 66 60 77Z" fill="{color}" stroke="#ffe2c0" stroke-opacity=".65"/>',
  layered: '<ellipse cx="60" cy="74" rx="45" ry="12" fill="{leaf_color}"/><path d="m16 69 10-18 12 12 11-22 11 16 11-16 11 22 12-12 10 18-20 11H36Z" fill="{leaf_color}" stroke="#d8eab0" stroke-opacity=".5"/><path d="m25 59 8-19 11 11 16-24 16 24 11-11 8 19-22 12H47Z" fill="{leaf_color}" stroke="#e6eec2" stroke-opacity=".5"/><ellipse cx="60" cy="68" rx="29" ry="7" fill="{color}" opacity=".7"/>',
};
const candles = {};
for (const count of [0,1,2,3]) {
  const positions = count === 1 ? [60] : count === 2 ? [52,68] : count === 3 ? [45,60,75] : [];
  candles[count] = positions.map(x=>`<rect x="${x-2}" y="30" width="4" height="31" rx="1" fill="{candle_color}" stroke="#ffecc2" stroke-width=".4"/><path class="boat-flame" d="M${x} 16Q${x+8} 27 ${x} 31Q${x-7} 26 ${x} 16Z" fill="#ffe5a2"/><path d="M${x} 24q4 4 0 6-4-2 0-6Z" fill="#fff9df"/>`).join('');
}
const incense = {0:''};
for (const count of [1,3]) {
  const positions = count === 1 ? [81] : [77,83,89];
  incense[count] = positions.map((x,i)=>`<path d="M${x} 62V13" stroke="#c9a773" stroke-width="1.1"/><path d="M${x} 13V8" stroke="#b9664a" stroke-width="1.2"/><path d="M${x} 6q${i%2?-5:5}-5 0-10" stroke="#e5dfc4" stroke-opacity=".5" stroke-width=".7" fill="none"/>`).join('');
}
const flower = (x,y) => `<g fill="{color}" stroke="#ffedcd" stroke-opacity=".35" stroke-width=".4"><circle cx="${x-4}" cy="${y}" r="4"/><circle cx="${x+4}" cy="${y}" r="4"/><circle cx="${x}" cy="${y-4}" r="4"/><circle cx="${x}" cy="${y+4}" r="4"/></g><circle cx="${x}" cy="${y}" r="2.5" fill="#f7d58e"/>`;
catalog.studio = {
  defaults: {enabled:true,color:'#eaa3b5',leaf_color:'#4f8a60',leaf:'folded',candles:1,incense:3,candle_color:'#f7dfaa',decoration:'flowers'},
  palette:[{name:'ชมพู',value:'#eaa3b5'},{name:'ทอง',value:'#e8c174'},{name:'ม่วง',value:'#b4a3d7'},{name:'ฟ้า',value:'#8cbcc8'},{name:'ส้ม',value:'#eeb17b'},{name:'ขาว',value:'#eee5ce'}],
  leaves:[{value:'folded',name:'พับกลีบ'},{value:'round',name:'กลีบมน'},{value:'lotus',name:'ดอกบัว'},{value:'layered',name:'ซ้อนชั้น'}],
  leaf_shapes:leaves,candles,incense,
  base:'<ellipse cx="60" cy="78" rx="48" ry="10" fill="#f0cc8b" fill-opacity=".08"/><ellipse cx="60" cy="78" rx="49" ry="9" fill="none" stroke="#e7d3a9" stroke-opacity=".35" stroke-width=".6"/>',
  front:'<path d="M20 68Q60 83 100 68L94 78Q60 91 26 78Z" fill="{leaf_color}" stroke="#cbd59d" stroke-opacity=".6" stroke-width=".6"/><path d="M26 75Q60 85 94 75" stroke="#ead99b" stroke-opacity=".6" fill="none" stroke-width="1"/>',
  decorations:{
    flowers:flower(31,69)+flower(89,69)+flower(44,77)+flower(76,77),
    pearls:[25,34,43,52,61,70,79,88,97].map((x,i)=>`<circle cx="${x}" cy="${72+Math.sin(i/8*Math.PI)*8}" r="2.7" fill="{color}" stroke="#ffedcd" stroke-width=".7"/>`).join(''),
    ribbon:'<path d="M60 77Q37 62 35 75Q38 87 60 80Q82 87 85 75Q83 62 60 77Z" fill="{color}" stroke="#ffe9c7" stroke-opacity=".6" stroke-width=".7"/><circle cx="60" cy="78" r="4" fill="{color}"/><path d="m57 81-6 9 9-3 8 4-5-10Z" fill="{color}"/>',
  },
  lantern:'<ellipse cx="60" cy="49" rx="45" ry="45" fill="{color}" fill-opacity=".08"/><path d="M34 13Q60 5 86 13L90 62Q88 77 60 78Q32 77 30 62Z" fill="{color}" stroke="#ffe5bd" stroke-width=".8"/><path d="M42 12Q46 45 42 73h12Q52 43 55 10Z" fill="#fff8e3" fill-opacity=".18"/><path d="M34 27q26 6 53 0M32 45q28 6 56 0M32 62q28 6 56 0M47 12q-4 33 0 62m26-62q4 33 0 62" stroke="#fff0cc" stroke-opacity=".3" fill="none" stroke-width=".6"/><ellipse cx="60" cy="76" rx="21" ry="5" fill="#825a42"/><ellipse cx="60" cy="75" rx="16" ry="3" fill="{candle_color}"/><path d="M60 57Q68 69 60 75Q53 69 60 57Z" fill="#ffe3a0"/><path d="m44 78 7 8h18l7-8" fill="none" stroke="#edce93"/>',
};
fs.writeFileSync(target,JSON.stringify(catalog,null,2));
console.log('Shared studio shapes generated.');
