import { cards as legacyCards } from './cards';

/**
 * Bundled Motivation card library. Phrases ship with the app (offline, no per-account copy, no
 * AI generation); only card IDs are stored per user (daily deck + favorites).
 *
 * Rules for growing the library:
 *  - IDs are permanent. Never reuse or renumber one — favorites and daily decks reference them.
 *  - `accent` must be an exact substring of `text` in the same language (highlighted in the card).
 *  - Phrases must be original or owned by Cubyfit; no commercial quotation collections.
 */
export const motivationCategories = ['Discipline', 'Fitness', 'Consistency', 'Confidence', 'Productivity', 'Personal Growth'] as const;
export type MotivationCategory = typeof motivationCategories[number];
export type CardLanguage = 'en' | 'fr' | 'ar';
type Localized = Readonly<Record<CardLanguage, string>>;

export type MotivationCard = {
  readonly id: string;
  readonly category: MotivationCategory;
  readonly secondary?: MotivationCategory;
  readonly text: Localized;
  readonly accent?: Partial<Localized>;
  readonly attribution?: string;
  /** Visual template; only `poster` exists today. */
  readonly template?: 'poster';
};

// The six original cards keep their IDs (existing favorites point at them) and their text.
const legacyAccents: Record<string, Localized> = {
  c1: { en: 'trust in yourself', fr: 'la confiance de demain', ar: 'ثقتك بنفسك' },
  c2: { en: 'build from there', fr: 'progressez', ar: 'تقدم منه' },
  c3: { en: 'next useful step', fr: 'prochaine étape utile', ar: 'الخطوة المفيدة التالية' },
  c4: { en: 'match your intentions', fr: 'suivent vos intentions', ar: 'مع نواياك' },
  c5: { en: 'what matters most', fr: 'ce qui compte le plus', ar: 'لما يهمك أكثر' },
  c6: { en: 'this one', fr: 'Commencez maintenant', ar: 'ابدأ الآن' },
};

const card = (id: string, category: MotivationCategory, text: Localized, accent: Localized, secondary?: MotivationCategory): MotivationCard =>
  ({ id, category, text, accent, ...(secondary ? { secondary } : {}), template: 'poster' });

const added: MotivationCard[] = [
  // Discipline
  card('m01', 'Discipline', { en: "Discipline is built on the days you don't feel like showing up.", fr: "La discipline se construit les jours où vous n'avez pas envie de venir.", ar: 'يُبنى الانضباط في الأيام التي لا ترغب فيها بالحضور.' }, { en: "don't feel like", fr: "n'avez pas envie", ar: 'لا ترغب فيها' }, 'Consistency'),
  card('m12', 'Discipline', { en: 'Motivation is a mood. Discipline is a decision.', fr: 'La motivation est une humeur. La discipline est une décision.', ar: 'الحماس مزاج. الانضباط قرار.' }, { en: 'Discipline', fr: 'La discipline', ar: 'الانضباط' }),
  card('m13', 'Discipline', { en: 'Tired still counts. Slow still counts. Today still counts.', fr: 'Fatigué, ça compte. Lentement, ça compte. Aujourd’hui compte.', ar: 'التعب يُحتسب. البطء يُحتسب. اليوم يُحتسب.' }, { en: 'Today still counts.', fr: 'Aujourd’hui compte.', ar: 'اليوم يُحتسب.' }, 'Consistency'),
  card('m14', 'Discipline', { en: 'The plan works when you stop negotiating with it.', fr: 'Le plan fonctionne quand vous arrêtez de le négocier.', ar: 'تنجح الخطة عندما تتوقف عن التفاوض معها.' }, { en: 'stop negotiating', fr: 'arrêtez de le négocier', ar: 'تتوقف عن التفاوض' }),
  card('m15', 'Discipline', { en: 'Your future self is watching what you do when no one else is.', fr: 'Votre futur vous regarde ce que vous faites quand personne ne regarde.', ar: 'ذاتك المستقبلية ترى ما تفعله حين لا يراك أحد.' }, { en: 'no one else is', fr: 'personne ne regarde', ar: 'لا يراك أحد' }, 'Personal Growth'),
  // Fitness
  card('m05', 'Fitness', { en: "The bar doesn't care how you feel. Lift anyway.", fr: 'La barre se moque de votre humeur. Soulevez quand même.', ar: 'البار لا يهتم بمزاجك. ارفع على أي حال.' }, { en: 'Lift anyway.', fr: 'Soulevez quand même.', ar: 'ارفع على أي حال.' }, 'Discipline'),
  card('m06', 'Fitness', { en: 'Stronger is a slow decision you make every set.', fr: 'Devenir plus fort est une décision lente, prise à chaque série.', ar: 'القوة قرار بطيء تتخذه في كل مجموعة.' }, { en: 'every set.', fr: 'à chaque série.', ar: 'في كل مجموعة.' }),
  card('m16', 'Fitness', { en: 'Sweat today is strength you get to keep.', fr: 'La sueur d’aujourd’hui est une force que vous gardez.', ar: 'عرق اليوم قوة تحتفظ بها.' }, { en: 'get to keep.', fr: 'que vous gardez.', ar: 'تحتفظ بها.' }),
  card('m17', 'Fitness', { en: 'Leave the gym a little stronger than you walked in.', fr: 'Quittez la salle un peu plus fort qu’en entrant.', ar: 'اخرج من النادي أقوى قليلًا مما دخلت.' }, { en: 'a little stronger', fr: 'un peu plus fort', ar: 'أقوى قليلًا' }),
  card('m18', 'Fitness', { en: 'Rest is part of the program, not a break from it.', fr: 'Le repos fait partie du programme, ce n’est pas une pause.', ar: 'الراحة جزء من البرنامج، لا استراحة منه.' }, { en: 'part of the program', fr: 'fait partie du programme', ar: 'جزء من البرنامج' }, 'Personal Growth'),
  // Consistency
  card('m02', 'Consistency', { en: "You don't need to be perfect. You need to be consistent.", fr: 'Pas besoin d’être parfait. Il faut être régulier.', ar: 'لا تحتاج أن تكون مثاليًا. تحتاج أن تكون مستمرًا.' }, { en: 'consistent.', fr: 'régulier.', ar: 'مستمرًا.' }),
  card('m04', 'Consistency', { en: 'Small actions. Repeated daily. Extraordinary results.', fr: 'Petites actions. Répétées chaque jour. Résultats extraordinaires.', ar: 'أفعال صغيرة. تتكرر يوميًا. نتائج استثنائية.' }, { en: 'Extraordinary', fr: 'extraordinaires', ar: 'استثنائية' }),
  card('m19', 'Consistency', { en: "Show up on the boring days. That's where it's built.", fr: 'Venez les jours sans éclat. C’est là que tout se construit.', ar: 'احضر في الأيام المملة. هناك يُبنى كل شيء.' }, { en: "That's where it's built.", fr: 'C’est là que tout se construit.', ar: 'هناك يُبنى كل شيء.' }, 'Discipline'),
  card('m20', 'Consistency', { en: 'A missed day is a detour, not the end of the road.', fr: 'Un jour manqué est un détour, pas la fin du chemin.', ar: 'اليوم الفائت منعطف، لا نهاية الطريق.' }, { en: 'not the end of the road.', fr: 'pas la fin du chemin.', ar: 'لا نهاية الطريق.' }),
  card('m21', 'Consistency', { en: 'Ten minutes today beats a perfect plan for tomorrow.', fr: 'Dix minutes aujourd’hui valent mieux qu’un plan parfait pour demain.', ar: 'عشر دقائق اليوم أفضل من خطة مثالية للغد.' }, { en: 'Ten minutes today', fr: 'Dix minutes aujourd’hui', ar: 'عشر دقائق اليوم' }, 'Productivity'),
  // Confidence
  card('m07', 'Confidence', { en: "Trust the reps you've already done.", fr: 'Faites confiance aux répétitions déjà faites.', ar: 'ثق بالتكرارات التي أنجزتها.' }, { en: 'reps', fr: 'répétitions', ar: 'التكرارات' }, 'Fitness'),
  card('m08', 'Confidence', { en: "Take up the space you've earned.", fr: 'Prenez la place que vous avez méritée.', ar: 'خذ المكانة التي استحققتها.' }, { en: 'earned.', fr: 'méritée.', ar: 'استحققتها.' }),
  card('m22', 'Confidence', { en: "You've survived every hard day so far. Keep the streak.", fr: 'Vous avez traversé chaque jour difficile. Gardez la série.', ar: 'تجاوزت كل يوم صعب حتى الآن. حافظ على السلسلة.' }, { en: 'Keep the streak.', fr: 'Gardez la série.', ar: 'حافظ على السلسلة.' }),
  card('m23', 'Confidence', { en: 'Proof beats pep talks. Go collect some proof.', fr: 'Les preuves battent les beaux discours. Allez en chercher.', ar: 'الدليل أقوى من الكلام. اذهب واجمع دليلك.' }, { en: 'collect some proof.', fr: 'Allez en chercher.', ar: 'اجمع دليلك.' }, 'Discipline'),
  card('m24', 'Confidence', { en: "Stand tall. You've done harder things than this.", fr: 'Tenez-vous droit. Vous avez déjà fait plus difficile.', ar: 'قف شامخًا. لقد فعلت ما هو أصعب.' }, { en: 'harder things', fr: 'plus difficile', ar: 'ما هو أصعب' }),
  // Productivity
  card('m09', 'Productivity', { en: "Start before you're ready. Adjust while you move.", fr: 'Commencez avant d’être prêt. Ajustez en avançant.', ar: 'ابدأ قبل أن تكون مستعدًا. عدّل وأنت تتحرك.' }, { en: 'Adjust', fr: 'Ajustez', ar: 'عدّل' }),
  card('m10', 'Productivity', { en: 'One hour of focus beats a day of being busy.', fr: 'Une heure de concentration vaut mieux qu’une journée occupée.', ar: 'ساعة تركيز أفضل من يوم مزدحم.' }, { en: 'focus', fr: 'concentration', ar: 'تركيز' }),
  card('m25', 'Productivity', { en: 'Finish one thing before you chase the next.', fr: 'Terminez une chose avant de courir après la suivante.', ar: 'أنهِ أمرًا واحدًا قبل أن تلاحق التالي.' }, { en: 'Finish one thing', fr: 'Terminez une chose', ar: 'أنهِ أمرًا واحدًا' }),
  card('m26', 'Productivity', { en: 'Clear the small task now. Free the mind for the big one.', fr: 'Réglez la petite tâche maintenant. Libérez l’esprit pour la grande.', ar: 'أنجز المهمة الصغيرة الآن. حرّر ذهنك للكبيرة.' }, { en: 'Free the mind', fr: 'Libérez l’esprit', ar: 'حرّر ذهنك' }),
  card('m27', 'Productivity', { en: 'Busy is easy. Choose what actually moves you forward.', fr: 'Être occupé est facile. Choisissez ce qui vous fait avancer.', ar: 'الانشغال سهل. اختر ما يدفعك إلى الأمام.' }, { en: 'moves you forward.', fr: 'vous fait avancer.', ar: 'يدفعك إلى الأمام.' }, 'Personal Growth'),
  // Personal Growth
  card('m03', 'Personal Growth', { en: 'The work you do today builds the person you become tomorrow.', fr: 'Le travail d’aujourd’hui construit la personne que vous serez demain.', ar: 'عمل اليوم يبني الشخص الذي ستصبحه غدًا.' }, { en: 'become tomorrow.', fr: 'que vous serez demain.', ar: 'ستصبحه غدًا.' }),
  card('m11', 'Personal Growth', { en: 'Be a little better than yesterday. That is the whole plan.', fr: 'Soyez un peu meilleur qu’hier. C’est tout le plan.', ar: 'كن أفضل قليلًا من الأمس. هذه هي الخطة كلها.' }, { en: 'whole plan.', fr: 'tout le plan.', ar: 'الخطة كلها.' }, 'Consistency'),
  card('m28', 'Personal Growth', { en: "Growth feels uncomfortable because it's working.", fr: 'Progresser est inconfortable parce que ça marche.', ar: 'النمو مزعج لأنه ينجح.' }, { en: "it's working.", fr: 'ça marche.', ar: 'ينجح.' }),
  card('m29', 'Personal Growth', { en: 'Compare yourself to who you were, not who they are.', fr: 'Comparez-vous à qui vous étiez, pas aux autres.', ar: 'قارن نفسك بمن كنت، لا بالآخرين.' }, { en: 'who you were', fr: 'qui vous étiez', ar: 'بمن كنت' }, 'Confidence'),
  card('m30', 'Personal Growth', { en: 'Your pace is still progress. Keep moving.', fr: 'Votre rythme reste un progrès. Continuez.', ar: 'وتيرتك تقدّم أيضًا. واصل التقدم.' }, { en: 'Keep moving.', fr: 'Continuez.', ar: 'واصل التقدم.' }),
];

export const motivationCatalog: readonly MotivationCard[] = [
  ...legacyCards.map(item => ({ id: item.id, category: item.category as MotivationCategory, text: item.text, accent: legacyAccents[item.id], template: 'poster' as const })),
  ...added,
];

const byId = new Map(motivationCatalog.map(item => [item.id, item]));
export const motivationCard = (id: string) => byId.get(id);
export const catalogIds = () => motivationCatalog.map(item => item.id);
export const inCategory = (item: MotivationCard, category: string) => category === 'All' || item.category === category || item.secondary === category;

/** Splits a phrase into plain/accent runs for rendering. Falls back to one plain run. */
export function phraseRuns(item: MotivationCard, language: CardLanguage): { text: string; accent: boolean }[] {
  const text = item.text[language] ?? item.text.en;
  const accent = item.accent?.[language];
  const at = accent ? text.indexOf(accent) : -1;
  if (!accent || at < 0) return [{ text, accent: false }];
  return [{ text: text.slice(0, at), accent: false }, { text: accent, accent: true }, { text: text.slice(at + accent.length), accent: false }].filter(run => run.text.length > 0);
}
