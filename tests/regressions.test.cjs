// Run with: node --test tests/regressions.test.cjs
// Execute the shipped inline script with a small DOM/storage adapter; no dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const source = script.slice(0, script.lastIndexOf('\nsetupRevealToggle();'));

function game() {
  const nodes = new Map(), storage = new Map();
  function element() {
    return { style: {}, classList: { add() {}, remove() {} }, children: [],
      appendChild(child) { this.children.push(child); }, addEventListener() {} };
  }
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    querySelectorAll() { return []; }, createElement: element,
  };
  const context = vm.createContext({ document, console, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run("state.name='测试'; state.position='前锋'; assignTeam('甲组', GROUPS['甲组'][0]);");
  return { run, nodes };
}

test('all league champions qualify for the following Super Cup', () => {
  for (const league of ['甲组', '乙组', '同济组']) {
    const { run } = game();
    run(`assignTeam(${JSON.stringify(league)}, GROUPS[${JSON.stringify(league)}][0]);
      state.seasonChampions={jia:'旧甲冠军',yi:'旧乙冠军',tongji:'旧同济冠军'};
      tourney={type:'华工杯',league:state.league,role:'player',stage:'knockout',playerGoals:0,
        knockoutRounds:[[{winner:state.team.name}]]};
      finishTournament();
      document.getElementById('mBtn1').onclick();
      launchSuperCup(false);`);
    assert.equal(run('tourney.superRound'), league === '甲组' ? 1 : 0);
    assert.equal(run(`state.seasonChampions[CHAMPION_KEYS[${JSON.stringify(league)}]]`), run('state.team.name'));
  }
});

test('relegation route also produces a champion for its own league', () => {
  const { run } = game();
  run(`state.seasonChampions={jia:'旧冠军',yi:'旧冠军',tongji:'旧冠军'};
    const groups=groupTeams(state.rosters['甲组'],groupSizesFor('华工杯','甲组'));
    groups.forEach(g=>{g.matches=simulateGroupMatches(g,null);g.matches.forEach(m=>{
      if(m.home===state.team.name){m.hg=0;m.ag=10;}
      if(m.away===state.team.name){m.hg=10;m.ag=0;}
    });});
    const qualified=groups.flatMap(g=>computeTable(g.teams,g.matches).slice(0,4).map(r=>r.team));
    tourney={type:'华工杯',league:'甲组',role:'player',stage:'relegation',relegated:false,playerGoals:0,groups};finishTournament();`);
  assert.ok(run('qualified.includes(state.seasonChampions.jia)'));
  assert.notEqual(run('state.seasonChampions.jia'), run('state.team.name'));
});

test('five-year medical cross-exam ends overseas route and preserves a full masters stage', () => {
  for (const overseas of [true, false]) {
    const { run } = game();
    run(`assignTeam('同济组','法医学系'); state.year=4; state.stats.academy=100;
      Math.random=()=>${overseas ? 0.1 : 0.4};
      milestoneEvent(4,state).choices.find(c=>c.text==='跨考').resolve(state); yearEnd();`);
    assert.equal(run('state.medical'), false);
    assert.equal(run('undergraduateYears(state)'), 5);
    assert.equal(run("document.getElementById('btnYearEnd').textContent"), overseas ? '查看结局' : '进入下一年');
    if (!overseas) {
      assert.equal(run("yearName(5,'读研')"), '研一');
      assert.equal(run("academicYears('读研',state)"), 8);
      assert.equal(run('milestoneEvent(7,state).title'), '读博抉择');
    }
  }
});

test('early medical transfer still changes to the ordinary four-year curriculum', () => {
  const { run } = game();
  run("assignTeam('同济组','基础医学院'); state.year=1; assignTransferCollege(state,true);");
  assert.equal(run('state.year'), 0);
  assert.equal(run('academicYears(state.path,state)'), 4);
});

test('already overdue saves can still finish', () => {
  const { run } = game();
  run("state.year=5;state.path='外校深造';yearEnd();");
  assert.equal(run("document.getElementById('btnYearEnd').textContent"), '查看结局');
});

test('clinical captain receives a temporary home identity even after same-year streaming', () => {
  for (const college of ['第一临床学院','第二临床学院']) {
    const { run } = game();
    run(`assignTeam('同济组','基础医学院');state.year=2;state.isCaptain=true;
      const process=processQueue;processQueue=()=>{};startYear();processQueue=process;
      const cup=queue.find(x=>x.tourney==='新生杯');
      medicalStreamEvent(state).choices.find(c=>c.text===${JSON.stringify(college)}).resolve(state);
      queue=[cup];processQueue();`);
    assert.equal(run('state.team.name'), '基础医学院');
    assert.ok(run('tourney.myGroup'));
    assert.equal(run('tourney.role'), 'coach');
    run('yearEnd=()=>{};tourney.onDone();');
    assert.equal(run('state.team.name'), college);
    assert.equal(run('state.league'), '同济组');
    assert.equal(run('state.medicalCupAlias'), false);
  }
});

test('old saves receive missing rosters, flags and Super Cup champions', () => {
  const { run } = game();
  run(`const old=JSON.parse(JSON.stringify(state));old.year=1;delete old.seasonChampions;
    delete old.rosters['同济组'];delete old.flags.warmedUpMatch;
    localStorage.setItem(SAVE_KEY,JSON.stringify({state:old}));`);
  assert.equal(run('loadGame()'), true);
  assert.equal(run("state.rosters['同济组'].length"), 8);
  assert.equal(run('state.flags.warmedUpMatch'), false);
  assert.doesNotThrow(() => run('startYear();'));
  assert.equal(run('tourney.type'), '超级杯');
});

test('migration uses latest Chinese-key results without changing promotion rosters', () => {
  const { run } = game();
  run(`const promoted=GROUPS['乙组'][0];swapDivision(promoted,GROUPS['甲组'][0]);
    const expected=JSON.stringify(state.rosters);
    state.seasonChampions={jia:'旧甲冠军',yi:'旧乙冠军',tongji:'旧同济冠军',
      '甲组':'新甲冠军','乙组':'新乙冠军','同济组':'新同济冠军'};saveGame();loadGame();`);
  assert.equal(run('state.seasonChampions.jia'), '新甲冠军');
  assert.equal(run('state.seasonChampions.yi'), '新乙冠军');
  assert.equal(run('state.seasonChampions.tongji'), '新同济冠军');
  assert.equal(run('JSON.stringify(state.rosters)===expected'), true);
});

test('stay-up training is inserted before milestones and keeps progress accounting', () => {
  const { run } = game();
  run(`state.year=3;state.flags.stayUpChain=true;state.yearPlanTotal=1;state.yearPlanDone=0;
    queue=[{type:'event',ev:milestoneEvent(3,state)}];const shown=[];renderEvent=ev=>shown.push(ev);
    processQueue();`);
  assert.equal(run('shown[0].stayUpChain'), true);
  assert.equal(run('queue[0].ev.title'), '升学抉择');
  run('processQueue();');
  assert.equal(run('shown[1].title'), '升学抉择');
  assert.equal(run('state.yearPlanTotal'), 2);
  assert.equal(run('state.yearPlanDone'), 2);
});

test('doctoral labels agree with milestones, including delayed masters graduation', () => {
  const { run } = game();
  run("state.path='读博';");
  for (const [year, label] of [[7,'博一'],[8,'博二'],[9,'博三']]) {
    assert.equal(run(`yearName(${year},state.path)`), label);
    assert.ok(run(`milestoneEvent(${year},state).title`).startsWith(label));
  }
  run("state.path='读研';state.year=7;state.extendedYears=1;Math.random=()=>0;milestoneEvent(7,state).choices[0].resolve(state);");
  assert.equal(run("yearName(8,state.path)"), '博一');
  assert.ok(run('milestoneEvent(8,state).title').startsWith('博一'));
  assert.equal(run('academicYears(state.path,state)'), 11);
});

test('inherited achievements survive initialization and save migration', () => {
  const { run } = game();
  run("state.achievements.first_goal=true;inheritAchievements();assignTeam('甲组',GROUPS['甲组'][0]);saveGame();loadGame();");
  assert.equal(run('state.achievements.first_goal'), true);
});

test('achievement workflow treats titles as data and appends each exact name only once', () => {
  const workflow=readFileSync(join(__dirname,'..','.github/workflows/full-achievers.yml'),'utf8');
  assert.match(workflow,/ISSUE_TITLE: \$\{\{ github.event.issue.title \}\}/);
  const body=workflow.split('        run: |\n')[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n');
  assert.ok(!body.includes('${{'));
  const dir=mkdtempSync(join(tmpdir(),'hustcup-workflow-'));
  try {
    writeFileSync(join(dir,'FULL_ACHIEVERS.md'),'# 玩家\n');
    const title='全成就玩家登记：$(touch INJECTED) `touch ALSO_INJECTED` "测试"';
    const execute=t=>spawnSync('bash',['-e','-c','git() { :; }\n'+body],{
      cwd:dir,env:{...process.env,ISSUE_TITLE:t},encoding:'utf8'});
    for(const t of [title,title,'全成就玩家登记：测试','全成就玩家登记：测试玩家']) {
      const result=execute(t);assert.equal(result.status,0,result.stderr);
    }
    assert.equal(existsSync(join(dir,'INJECTED')),false);
    assert.equal(existsSync(join(dir,'ALSO_INJECTED')),false);
    assert.deepEqual(readFileSync(join(dir,'FULL_ACHIEVERS.md'),'utf8').trim().split('\n'),[
      '# 玩家','- '+title.replace('全成就玩家登记：',''),'- 测试','- 测试玩家']);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('medical final year keeps the graduation cup without the removed farewell event', () => {
  const { run } = game();
  run("assignTeam('同济组','法医学系');state.year=4;processQueue=()=>{};startYear();");
  assert.equal(run("queue.filter(x=>x.tourney==='毕业杯').length"), 1);
  assert.equal(run("queue.some(x=>x.ev && x.ev.title==='大五告别战')"), false);
  assert.equal(run('typeof farewellMatchEvent'), 'undefined');
});

test('archive achievements count for an older career and newly unlocked goals persist immediately', () => {
  const { run } = game();
  run("state.achievements.first_goal=true;inheritAchievements();state.achievements={};");
  assert.equal(run('achievementCount()'), 1);
  run('state.careerGoals=20;checkAchievements(state);');
  assert.equal(run('loadInheritedAchievements().goal_hunter'), true);
});
