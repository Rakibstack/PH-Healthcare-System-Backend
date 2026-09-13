
export interface IQuery {
  searchTerm?: string;
  limit?: string;
  page?: string;
  sortOrder?: string;
  sortBy? : string;

  [key : string] : any;
}