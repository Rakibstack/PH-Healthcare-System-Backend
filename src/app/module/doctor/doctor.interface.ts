export interface IApplyAsDoctor {
  user: {
    name: string;
    email: string;
  };
  doctor: {
    address?: string;
    contactNumber?: string;
    bio?: string;
    specialization: string;
    licenseNumber: string;
    qualification: string;
    experienceYears: number;
  };
}
