export const demoMember = {
  firstName: "Adama",
  fullName: "Adama Sidibé",
  memberNumber: "00482",
  household: "Famille Sidibé",
  balance: 40,
  annualExpected: 80,
  annualPaid: 40,
  nextDueLabel: "Deuxième dimanche de septembre",
};

export const demoContributions = [
  { period: "Mars 2026", amount: 20, paid: 20, status: "paid" as const },
  { period: "Juin 2026", amount: 20, paid: 10, status: "partial" as const },
  { period: "Septembre 2026", amount: 20, paid: 0, status: "upcoming" as const },
  { period: "Décembre 2026", amount: 20, paid: 0, status: "upcoming" as const },
];

export const officeStats = {
  members: 500,
  collected: 18240,
  remaining: 6460,
  statuses: [
    { label: "À jour", count: 312, tone: "blue" as const },
    { label: "Moins de 6 mois", count: 96, tone: "green" as const },
    { label: "6 à 11 mois", count: 54, tone: "orange" as const },
    { label: "12 mois et plus", count: 38, tone: "red" as const },
  ],
};

export const priorityHouseholds = [
  { name: "Famille Diallo", detail: "Couple + 2 enfants", balance: 150, tone: "red" as const },
  { name: "Famille Traoré", detail: "Couple + 1 enfant", balance: 90, tone: "orange" as const },
  { name: "M. Camara", detail: "Homme", balance: 40, tone: "green" as const },
];
