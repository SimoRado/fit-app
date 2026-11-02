import { describe, expect, it } from 'vitest';
import { addDays, localTimestamp, validDay, weekStart } from '../src/core/date';
import { habitRate, habitStreak, missionProgress, missionRate, scheduled, weightGoalProgress, weightSummary, workoutStats } from '../src/core/logic';
import { Habit, HabitCompletion, Mission, WeightEntry, Workout } from '../src/core/types';
import { validateProfileValues } from '../src/core/validation';
import { personalRecords } from '../src/core/logic';
const habit=(patch:Partial<Habit>={}):Habit=>({id:'h',owner_id:'p',name:'Read',description:'',category:'Learning',icon:'✓',frequency:'days',days:'1,3,5',weekly_target:3,start_date:'2026-11-02',archived:0,reminder_time:null,created_at:'',...patch});
const done=(days:string[]):HabitCompletion[]=>days.map((day,i)=>({id:String(i),habit_id:'h',day,created_at:''}));
describe('local calendar',()=>{it('crosses month and daylight saving dates as calendar days',()=>{expect(addDays('2026-03-28',2)).toBe('2026-03-30');expect(addDays('2026-11-01',1)).toBe('2026-11-02');expect(weekStart('2026-11-08')).toBe('2026-11-02');expect(validDay('2026-02-30')).toBe(false);});it('validates and stores local workout times as UTC instants',()=>{expect(Number.isNaN(Date.parse(localTimestamp('2026-11-02','18:30')))).toBe(false);expect(()=>localTimestamp('2026-11-02','25:00')).toThrow();});});
describe('habit rules',()=>{it('only schedules selected weekdays',()=>{const h=habit();expect(scheduled(h,'2026-11-02')).toBe(true);expect(scheduled(h,'2026-11-03')).toBe(false);expect(scheduled(h,'2026-11-04')).toBe(true);});it('counts scheduled days, completion and undo accurately',()=>{const h=habit();expect(habitRate([h],done(['2026-11-02']),'2026-11-02','2026-11-06')).toEqual({due:3,done:1,remaining:2,percent:33});expect(habitRate([h],[], '2026-11-02','2026-11-06').done).toBe(0);});it('measures weekly quota goals weekly, not as a fake daily due item',()=>{const h=habit({frequency:'quota',weekly_target:3});expect(habitRate([h],[],'2026-11-02','2026-11-02').due).toBe(0);expect(habitRate([h],[],'2026-11-02','2026-11-02',true).due).toBe(3);});it('preserves streak across unscheduled days',()=>{const h=habit();expect(habitStreak(h,done(['2026-11-02','2026-11-04','2026-11-06']),'2026-11-07')).toMatchObject({current:3,longest:3,total:3});});it('uses completed weeks for quota streaks, including a shorter first week',()=>{const h=habit({frequency:'quota',weekly_target:2});expect(habitStreak(h,done(['2026-11-02','2026-11-03','2026-11-09','2026-11-11']),'2026-11-12')).toMatchObject({current:2,longest:2});const partial=habit({frequency:'quota',weekly_target:3,start_date:'2026-11-07'});expect(habitStreak(partial,done(['2026-11-07','2026-11-08']),'2026-11-08')).toMatchObject({current:1,longest:1});});});
describe('automatic missions',()=>{const mission=(type:Mission['type']):Mission=>({id:'m',owner_id:'p',title:'Goal',type,target:2,period:'daily',active:1,created_at:''});const base={completions:[...done(['2026-11-02']),{id:'other',habit_id:'other',day:'2026-11-02',created_at:''}],workouts:[] as Workout[],weights:[] as WeightEntry[],manual:[]};it('recomputes habit progress after undo',()=>{expect(missionProgress(mission('habits'),'2026-11-02',base).done).toBe(true);expect(missionProgress(mission('habits'),'2026-11-02',{...base,completions:base.completions.slice(1)}).done).toBe(false);});it('counts completed workouts and weight entries',()=>{const workout={id:'w',owner_id:'p',name:'Gym',day:'2026-11-02',started_at:'',duration_min:30,notes:'',completed:1,created_at:''};expect(missionProgress({...mission('workouts'),target:1},'2026-11-02',{...base,workouts:[workout]}).done).toBe(true);expect(missionProgress({...mission('weight'),target:1},'2026-11-02',{...base,weights:[{id:'x',owner_id:'p',day:'2026-11-02',kg:80,note:'',created_at:''}]}).done).toBe(true);});});
describe('progress summaries',()=>{it('orders weight by day and timestamp, without inventing change',()=>{const entries:WeightEntry[]=[{id:'b',owner_id:'p',day:'2026-11-02',kg:82,note:'',created_at:'b'},{id:'a',owner_id:'p',day:'2026-11-01',kg:80,note:'',created_at:'a'},{id:'c',owner_id:'p',day:'2026-11-02',kg:81,note:'',created_at:'c'}];expect(weightSummary(entries).change).toBe(1);expect(weightSummary(entries.slice(0,1)).change).toBeNull();});it('ignores draft workouts and reports peak weekly frequency',()=>{const w:Workout={id:'w',owner_id:'p',name:'Gym',day:'2026-11-02',started_at:'',duration_min:30,notes:'',completed:1,created_at:''};expect(workoutStats([w,{...w,id:'w2',day:'2026-11-03'},{...w,id:'draft',completed:0}],'2026-11-03')).toMatchObject({total:2,week:2,month:2,minutes:60,mostInWeek:2});});});

describe('period ranges and edge cases',()=>{
  it('prorates weekly quota targets across partial selected weeks and caps completions at the due target',()=>{
    const weekly=habit({frequency:'quota',weekly_target:3,start_date:'2026-11-02'});
    expect(habitRate([weekly],done(['2026-11-03','2026-11-04']),'2026-11-03','2026-11-05',true)).toMatchObject({due:2,done:2,percent:100});
    expect(habitRate([weekly],done(['2026-11-03','2026-11-04','2026-11-05']),'2026-11-03','2026-11-05',true).done).toBe(2);
  });
  it('excludes archived habits from schedule and selected-period denominators while retaining historical completions',()=>{
    const archived=habit({archived:1});
    expect(scheduled(archived,'2026-11-02')).toBe(false);
    expect(habitRate([archived],done(['2026-11-02']),'2026-11-02','2026-11-02')).toMatchObject({due:0,done:0,percent:0});
    expect(habitStreak(archived,done(['2026-11-02']),'2026-11-02').total).toBe(1);
  });
  it('keeps fixed-frequency habit streaks across unscheduled calendar and month boundaries',()=>{
    const weekly=habit({start_date:'2026-10-30',frequency:'days',days:'5'});
    expect(habitStreak(weekly,done(['2026-10-30','2026-11-06']),'2026-11-08')).toMatchObject({current:2,longest:2});
  });
  it('computes goal progress for both loss and gain goals and handles unset or completed goals',()=>{
    expect(weightGoalProgress(90,80,70)).toBe(50);
    expect(weightGoalProgress(60,70,80)).toBe(50);
    expect(weightGoalProgress(90,65,70)).toBe(100);
    expect(weightGoalProgress(80,82,80)).toBe(0);
    expect(weightGoalProgress(80,80,null)).toBeNull();
  });
  it('filters daily and weekly mission completion by the selected date range',()=>{
    const daily:Mission={id:'daily',owner_id:'p',title:'Do it',type:'manual',target:1,period:'daily',active:1,created_at:''};
    const weekly:Mission={...daily,id:'weekly',period:'weekly'};
    const data={completions:[] as HabitCompletion[],workouts:[] as Workout[],weights:[] as WeightEntry[],manual:[{id:'m1',mission_id:'daily',day:'2026-11-02'},{id:'m2',mission_id:'weekly',day:'2026-11-03'}]};
    expect(missionRate([daily,weekly],data,'2026-11-02','2026-11-04')).toMatchObject({due:4,done:2,percent:50});
    expect(missionRate([daily,weekly],data,'2026-11-04','2026-11-04')).toMatchObject({due:2,done:1});
  });
  it('recomputes automatic mission progress when source activity is undone or becomes a draft',()=>{
    const workout={id:'w',owner_id:'p',name:'Gym',day:'2026-11-02',started_at:'',duration_min:30,notes:'',completed:1,created_at:''};
    const workMission:Mission={id:'wm',owner_id:'p',title:'Train',type:'workouts',target:1,period:'daily',active:1,created_at:''};
    expect(missionProgress(workMission,'2026-11-02',{completions:[],workouts:[workout],weights:[],manual:[]}).done).toBe(true);
    expect(missionProgress(workMission,'2026-11-02',{completions:[],workouts:[{...workout,completed:0}],weights:[],manual:[]}).done).toBe(false);
  });
  it('formats DST-spanning local calendar ranges without fixed-hour arithmetic',()=>{
    expect(addDays('2026-03-07',7)).toBe('2026-03-14');
    expect(addDays('2026-11-01',7)).toBe('2026-11-08');
    expect(validDay('2026-02-29')).toBe(false);
  });
  it('validates onboarding fields and rejects empty names, invalid dates and out-of-range measurements',()=>{
    const valid={name:' Alex ',birth_date:'1990-01-01',height_cm:175,start_weight:80,target_weight:75};
    expect(validateProfileValues(valid,'2026-11-02').name).toBe('Alex');
    expect(()=>validateProfileValues({...valid,name:'   '},'2026-11-02')).toThrow();
    expect(()=>validateProfileValues({...valid,birth_date:'2026-11-02'},'2026-11-02')).toThrow('0–120');
    expect(()=>validateProfileValues({...valid,birth_date:'1800-01-01'},'2026-11-02')).toThrow('0–120');
    expect(()=>validateProfileValues({...valid,height_cm:NaN},'2026-11-02')).toThrow();
    expect(()=>validateProfileValues({...valid,start_weight:501},'2026-11-02')).toThrow();
    expect(()=>validateProfileValues({...valid,target_weight:19},'2026-11-02')).toThrow();
  });
  it('calculates each personal record from a single real completed set and updates after historical edits',()=>{
    const exercise={id:'bench',name:'Bench Press',metric:'weight_reps' as const,custom:0};
    const link={id:'link',workout_id:'w',exercise_id:'bench',position:0};
    const workout:Workout={id:'w',owner_id:'p',name:'Gym',day:'2026-11-02',started_at:'',duration_min:30,notes:'',completed:1,created_at:''};
    const set={id:'set',workout_exercise_id:'link',set_number:1,reps:8,weight_kg:60,duration_sec:null,note:''};
    expect(personalRecords([exercise],[link],[set],[workout])).toEqual([{name:'Bench Press',metric:'weight_reps',value:60,reps:8}]);
    expect(personalRecords([exercise],[link],[{...set,weight_kg:65}],[workout])[0].value).toBe(65);
    expect(personalRecords([exercise],[link],[set],[{...workout,completed:0}])).toEqual([]);
  });
});
