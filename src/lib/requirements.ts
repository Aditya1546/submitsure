export interface Requirement {
  id: string;
  label: string;
  description: string;
}

export interface RequirementSet {
  id: string;
  name: string;
  requirements: Requirement[];
}

/** Example templates — generic, not tied to any state or scheme. Users can edit freely. */
export const REQUIREMENT_TEMPLATES: RequirementSet[] = [
  {
    id: "merit-general",
    name: "General merit scholarship",
    requirements: [
      { id: "id-proof", label: "Identity proof", description: "Government-issued photo ID" },
      { id: "marksheet", label: "Latest marksheet", description: "Most recent academic transcript" },
      { id: "enrollment", label: "Enrollment certificate", description: "Proof of current enrollment" },
      { id: "bank", label: "Bank account proof", description: "Passbook or cancelled cheque" },
    ],
  },
  {
    id: "need-based",
    name: "Need-based scholarship",
    requirements: [
      { id: "id-proof", label: "Identity proof", description: "Government-issued photo ID" },
      { id: "income", label: "Income certificate", description: "Household income for the current year" },
      { id: "marksheet", label: "Latest marksheet", description: "Most recent academic transcript" },
      { id: "residence", label: "Residence proof", description: "Domicile or address certificate" },
      { id: "bank", label: "Bank account proof", description: "Passbook or cancelled cheque" },
    ],
  },
];
